-- Shared resolve pass for Condition: walks every coding through
-- cm.fhir_system_to_omop_vocab → vocab.concept (source) → Maps-to →
-- vocab.concept (standard) ONCE, materializes the result so the four
-- per-domain stage-2 ETLs (Condition__condition_occurrence /
-- __observation / __procedure_occurrence / __measurement) only do a
-- cheap WHERE std_domain='X' filter against this table instead of
-- re-running the four-table JOIN.
--
-- DISTINCT ON (id, std.concept_id) collapses the SNOMED+ICD10 case
-- where two codings of the same Condition Maps-to the same standard
-- concept; ORDER BY prefers SNOMED so the surviving src_* columns
-- come from the already-Standard vocab.

-- Cross-resource date fallback: some EHR sources (e.g. MIMIC) carry no
-- onset/recordedDate on the Condition — the event date lives on the linked
-- Encounter. Taken from staging.encounter_visit (the Encounter stage-1
-- ViewDefinition output — NEVER raw fhir.* jsonb; all FHIR access stays in
-- stage-1 views). The guard stub keeps this resolve runnable when no
-- Encounter view was materialized (no Encounters in the source → NULL
-- fallback → no behavior change for Synthea/US-Core, which carry onset).
CREATE TABLE IF NOT EXISTS staging.encounter_visit (id text, period_start text);

-- Unmapped-code fallback (f2o-032): a Condition whose codings resolve to NO
-- Standard concept (unknown code system, code absent from vocab.concept, or no
-- 'Maps to' → Standard) must NOT be dropped. The `resolved` CTE is the vocab
-- walk (INNER JOINs, as before); the `fallback` CTE re-emits one row per
-- Condition that produced no resolved row, with concept_id=0 / source_concept_id=0
-- and std_domain forced to 'Condition' so it routes to condition_occurrence by
-- the resource-type default (f2o-037 secondary). Column lists MUST stay aligned
-- for the UNION ALL.
DROP TABLE IF EXISTS staging.condition_resolved;
CREATE TABLE staging.condition_resolved AS
WITH resolved AS (
    SELECT DISTINCT ON (v.id, std.concept_id)
        v.id,
        v.subject_ref, v.encounter_ref, v.recorder_ref, v.asserter_ref,
        v.clinical_status_code, v.verification_status_code, v.category_code,
        v.onset_dt, v.onset_period_start, v.recorded_date,
        enc.period_start        AS encounter_start_dt,
        v.abatement_dt, v.abatement_period_end, v.abatement_string,
        v.code_text,
        v.code_system,
        v.code_value           AS src_code,
        v.code_display,
        src.concept_id         AS src_concept_id,
        std.concept_id         AS std_concept_id,
        std.domain_id          AS std_domain
    FROM staging.condition_occurrence v
    JOIN cm.fhir_system_to_omop_vocab sa
      ON sa.source_code = v.code_system
    JOIN vocab.concept src
      ON src.vocabulary_id  = sa.target_code
     AND src.concept_code   = v.code_value
    JOIN vocab.concept_relationship rel
      ON rel.concept_id_1   = src.concept_id
     AND rel.relationship_id = 'Maps to'
     AND rel.invalid_reason IS NULL
    JOIN vocab.concept std
      ON std.concept_id      = rel.concept_id_2
     AND std.standard_concept = 'S'
    LEFT JOIN staging.encounter_visit enc
      ON enc.id = v.encounter_ref
    ORDER BY v.id, std.concept_id,
             CASE v.code_system
                 WHEN 'http://snomed.info/sct'             THEN 1
                 WHEN 'http://hl7.org/fhir/sid/icd-10-cm'  THEN 2
                 WHEN 'http://hl7.org/fhir/sid/icd-9-cm'   THEN 3
                 WHEN 'http://hl7.org/fhir/sid/icd-10'     THEN 4
                 ELSE 9
             END
),
-- Specificity dedup (f2o-036): when the SAME Condition resolves to both a
-- concept and a more-specific descendant of it (e.g. 'Asthma' 317009 AND
-- 'Allergic asthma' 4191479), drop the ancestor so the clinical condition
-- isn't double-counted — keep only the most-specific concept(s). Uses the
-- pre-computed transitive closure vocab.concept_ancestor.
specific AS (
    SELECT r.* FROM resolved r
    WHERE NOT EXISTS (
        SELECT 1 FROM resolved r2
        JOIN vocab.concept_ancestor ca
          ON ca.ancestor_concept_id   = r.std_concept_id
         AND ca.descendant_concept_id = r2.std_concept_id
        WHERE r2.id = r.id
          AND ca.ancestor_concept_id <> ca.descendant_concept_id
    )
),
fallback AS (
    SELECT DISTINCT ON (v.id)
        v.id,
        v.subject_ref, v.encounter_ref, v.recorder_ref, v.asserter_ref,
        v.clinical_status_code, v.verification_status_code, v.category_code,
        v.onset_dt, v.onset_period_start, v.recorded_date,
        enc.period_start        AS encounter_start_dt,
        v.abatement_dt, v.abatement_period_end, v.abatement_string,
        v.code_text,
        v.code_system,
        v.code_value           AS src_code,
        v.code_display,
        0                       AS src_concept_id,
        0                       AS std_concept_id,
        'Condition'            AS std_domain
    FROM staging.condition_occurrence v
    LEFT JOIN staging.encounter_visit enc
      ON enc.id = v.encounter_ref
    WHERE v.id NOT IN (SELECT id FROM resolved)
    ORDER BY v.id
)
SELECT * FROM specific
UNION ALL
SELECT * FROM fallback;

CREATE INDEX IF NOT EXISTS ix_condition_resolved_domain ON staging.condition_resolved (std_domain);
ANALYZE staging.condition_resolved;
