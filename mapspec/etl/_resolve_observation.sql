-- Shared resolve pass for Observation (top-level Observation.code): walks
-- every coding through cm.fhir_system_to_omop_vocab → vocab.concept (source)
-- → Maps-to → vocab.concept (standard) ONCE, resolves the value / unit /
-- operator alongside, and materializes the result so the two per-domain
-- stage-2 ETLs (Observation__measurement / __observation) only do a cheap
-- WHERE std_domain='X' filter against this table instead of each re-running
-- the four-table vocab JOIN (it used to run 2× — once per sibling).
--
-- Mirrors mapspec/etl/_resolve_condition.sql. Key points:
--   * Per-coding fan-out comes from the view (forEach: code.coding); here we
--     DISTINCT ON (id, std.concept_id) so two codings of the same Observation
--     that Maps-to the same standard concept collapse to one row. ORDER BY
--     prefers LOINC, then SNOMED, so the surviving src_* come from the
--     primary vocabulary.
--   * Panel-parent rows (Blood-pressure panel 85354-9, CBC 58410-2 — code
--     resolves but the Observation itself carries no value, only its
--     components do) are dropped by the value-presence WHERE; their data is
--     fanned out by the component family (_resolve_observation_component.sql).
--   * value_as_concept_id is resolved against the source value coding in any
--     domain (no domain filter — the answer concept can live anywhere).

DROP TABLE IF EXISTS staging.observation_resolved;
CREATE TABLE staging.observation_resolved AS
SELECT DISTINCT ON (v.id, std.concept_id)
    v.id,
    v.status,
    v.subject_id, v.encounter_id, v.performer_id,
    v.effective_dt, v.effective_period_start,
    v.value_number, v.value_string,
    v.value_unit_text, v.value_text,
    v.qualifier_code,
    v.range_low, v.range_high,
    v.gene_symbol, v.hgvs_string, v.has_members,
    v.code_text,
    v.code_value           AS src_code,
    src.concept_id         AS src_concept_id,
    std.concept_id         AS std_concept_id,
    std.domain_id          AS std_domain,
    vr.value_as_concept_id,
    unit.concept_id        AS unit_concept_id,
    om.concept_id          AS operator_concept_id
FROM staging.observation_coded v
JOIN cm.fhir_system_to_omop_vocab sa
  ON sa.source_code = v.code_system
JOIN vocab.concept src
  ON src.vocabulary_id  = sa.target_code
 AND src.concept_code   = v.code_value
JOIN vocab.concept_relationship rel
  ON rel.concept_id_1    = src.concept_id
 AND rel.relationship_id = 'Maps to'
 AND rel.invalid_reason IS NULL
JOIN vocab.concept std
  ON std.concept_id       = rel.concept_id_2
 AND std.standard_concept = 'S'
LEFT JOIN LATERAL (
    -- valueCodeableConcept → value_as_concept_id (1→N Maps-to: lowest concept_id).
    SELECT vstd.concept_id AS value_as_concept_id
    FROM cm.fhir_system_to_omop_vocab vsa
    JOIN vocab.concept vsrc               ON vsrc.vocabulary_id = vsa.target_code AND vsrc.concept_code = v.value_code
    JOIN vocab.concept_relationship vrel  ON vrel.concept_id_1 = vsrc.concept_id AND vrel.relationship_id = 'Maps to' AND vrel.invalid_reason IS NULL
    JOIN vocab.concept vstd               ON vstd.concept_id = vrel.concept_id_2 AND vstd.standard_concept = 'S'
    WHERE vsa.source_code = v.value_code_system
    ORDER BY vstd.concept_id
    LIMIT 1
) vr ON TRUE
LEFT JOIN vocab.concept unit
  ON unit.vocabulary_id = 'UCUM' AND unit.concept_code = v.value_unit_code AND unit.standard_concept = 'S'
LEFT JOIN (VALUES ('<', 4171756), ('<=', 4171754), ('>=', 4171755), ('>', 4172704)) AS om(op_code, concept_id)
  ON om.op_code = v.value_comparator
WHERE (v.value_number IS NOT NULL
    OR v.value_string IS NOT NULL
    OR v.value_code   IS NOT NULL
    OR v.value_text   IS NOT NULL
    OR v.gene_symbol  IS NOT NULL
    OR v.hgvs_string  IS NOT NULL)
  AND COALESCE(v.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')
ORDER BY v.id, std.concept_id,
         CASE v.code_system
             WHEN 'http://loinc.org'        THEN 1
             WHEN 'http://snomed.info/sct'  THEN 2
             ELSE 9
         END;

CREATE INDEX IF NOT EXISTS ix_observation_resolved_domain ON staging.observation_resolved (std_domain);
ANALYZE staging.observation_resolved;
