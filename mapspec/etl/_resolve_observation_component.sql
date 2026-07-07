-- Shared resolve pass for Observation.component[]: same idea as
-- _resolve_observation.sql but for the component fan-out. Each component
-- carries its own code + value; we resolve the component code through
-- cm.fhir_system_to_omop_vocab → Maps-to ONCE and tag std_domain, so the two
-- component stage-2 ETLs (Observation_component__measurement / __observation)
-- become trivial WHERE std_domain='X' filters instead of each re-running the
-- vocab JOIN with a hard-coded LOINC vocabulary and domain.
--
-- Generalised vs the previous LOINC-only version: the source vocabulary comes
-- from cm.fhir_system_to_omop_vocab(component_code_system), so non-LOINC
-- component codings resolve too. DISTINCT ON (id, component_code,
-- std.concept_id) keeps one row per (parent, component-code, standard concept).
-- value_as_concept_id is resolved from component.valueCodeableConcept in any
-- domain (PRAPARE / survey answers).

DROP TABLE IF EXISTS staging.observation_component_resolved;
CREATE TABLE staging.observation_component_resolved AS
WITH resolved AS (
SELECT DISTINCT ON (v.id, v.component_code, std.concept_id)
    v.id,
    v.status,
    v.subject_id, v.encounter_id, v.performer_id,
    v.effective_dt, v.effective_period_start,
    v.component_code        AS src_code,
    v.component_code_text,
    v.component_value_num,
    v.component_unit_text,
    v.component_value_text, v.component_value_string, v.component_value_code,
    src.concept_id          AS src_concept_id,
    std.concept_id          AS std_concept_id,
    std.domain_id           AS std_domain,
    vr.value_as_concept_id,
    unit.concept_id         AS unit_concept_id
FROM staging.observation_component v
JOIN cm.fhir_system_to_omop_vocab sa
  ON sa.source_code = v.component_code_system
JOIN vocab.concept src
  ON src.vocabulary_id  = sa.target_code
 AND src.concept_code   = v.component_code
JOIN vocab.concept_relationship rel
  ON rel.concept_id_1    = src.concept_id
 AND rel.relationship_id = 'Maps to'
 AND rel.invalid_reason IS NULL
JOIN vocab.concept std
  ON std.concept_id       = rel.concept_id_2
 AND std.standard_concept = 'S'
LEFT JOIN LATERAL (
    SELECT vstd.concept_id AS value_as_concept_id
    FROM cm.fhir_system_to_omop_vocab vsa
    JOIN vocab.concept vsrc               ON vsrc.vocabulary_id = vsa.target_code AND vsrc.concept_code = v.component_value_code
    JOIN vocab.concept_relationship vrel  ON vrel.concept_id_1 = vsrc.concept_id AND vrel.relationship_id = 'Maps to' AND vrel.invalid_reason IS NULL
    JOIN vocab.concept vstd               ON vstd.concept_id = vrel.concept_id_2 AND vstd.standard_concept = 'S'
    WHERE vsa.source_code = v.component_value_code_system
    ORDER BY vstd.concept_id
    LIMIT 1
) vr ON TRUE
LEFT JOIN vocab.concept unit
  ON unit.vocabulary_id = 'UCUM' AND unit.concept_code = v.component_unit_code AND unit.standard_concept = 'S'
WHERE v.component_code IS NOT NULL
  AND COALESCE(v.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')
ORDER BY v.id, v.component_code, std.concept_id
)
-- Specificity dedup (f2o-036), within the same component: drop an ancestor
-- concept when the component also resolved to a more-specific descendant.
SELECT r.* FROM resolved r
WHERE NOT EXISTS (
    SELECT 1 FROM resolved r2
    JOIN vocab.concept_ancestor ca
      ON ca.ancestor_concept_id   = r.std_concept_id
     AND ca.descendant_concept_id = r2.std_concept_id
    WHERE r2.id = r.id
      AND r2.src_code = r.src_code
      AND ca.ancestor_concept_id <> ca.descendant_concept_id
);

CREATE INDEX IF NOT EXISTS ix_observation_component_resolved_domain ON staging.observation_component_resolved (std_domain);
ANALYZE staging.observation_component_resolved;
