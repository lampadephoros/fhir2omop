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

DROP TABLE IF EXISTS staging.condition_resolved;
CREATE TABLE staging.condition_resolved AS
SELECT DISTINCT ON (v.id, std.concept_id)
    v.id,
    v.subject_ref, v.encounter_ref, v.recorder_ref, v.asserter_ref,
    v.clinical_status_code, v.verification_status_code, v.category_code,
    v.primary_condition_ref,
    v.onset_dt, v.onset_period_start, v.recorded_date,
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
ORDER BY v.id, std.concept_id,
         CASE v.code_system
             WHEN 'http://snomed.info/sct'             THEN 1
             WHEN 'http://hl7.org/fhir/sid/icd-10-cm'  THEN 2
             WHEN 'http://hl7.org/fhir/sid/icd-9-cm'   THEN 3
             WHEN 'http://hl7.org/fhir/sid/icd-10'     THEN 4
             ELSE 9
         END;

CREATE INDEX IF NOT EXISTS ix_condition_resolved_domain ON staging.condition_resolved (std_domain);
ANALYZE staging.condition_resolved;
