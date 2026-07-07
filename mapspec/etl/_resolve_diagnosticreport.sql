-- Shared resolve pass for DiagnosticReport (the report's own DR.code): walks
-- every coding through cm.fhir_system_to_omop_vocab → vocab.concept (source)
-- → Maps-to → vocab.concept (standard) ONCE, so the three per-domain stage-2
-- ETLs (DiagnosticReport__measurement / __observation / __procedure_occurrence)
-- only do a cheap WHERE std_domain='X' filter against this table instead of
-- each re-running the vocab JOIN with a hard-coded domain (it used to run 3×,
-- once per sibling, each with its own LOINC/SNOMED/CPT4 unionAll CTE).
--
-- Mirrors mapspec/etl/_resolve_condition.sql and _resolve_observation.sql:
--   * Per-coding fan-out comes from the view (forEach: code.coding); here we
--     DISTINCT ON (id, std.concept_id) so two codings of the same report that
--     Maps-to the same standard concept collapse to one row. ORDER BY prefers
--     LOINC, then SNOMED, then CPT4, so the surviving src_* come from the
--     primary vocabulary.
--   * Source vocabulary is resolved generically via cm.fhir_system_to_omop_vocab
--     instead of the old hard-coded LOINC/SNOMED/CPT4 prio list.
--   * Note-domain codings (document-type LOINCs on the ~6.4k multi-coding
--     reports) stay in this table but match none of the three routing
--     siblings; the report's text body is captured separately by the
--     per-report DiagnosticReport__note edge.

DROP TABLE IF EXISTS staging.diagnosticreport_resolved;
CREATE TABLE staging.diagnosticreport_resolved AS
WITH resolved AS (
SELECT DISTINCT ON (v.id, std.concept_id)
    v.id,
    v.status,
    v.subject_ref, v.encounter_ref, v.performer_practitioner_ref,
    v.effective_dt,
    v.code_text,
    v.code_value           AS src_code,
    src.concept_id         AS src_concept_id,
    std.concept_id         AS std_concept_id,
    std.domain_id          AS std_domain
FROM staging.diagnosticreport_coded v
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
WHERE COALESCE(v.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')
ORDER BY v.id, std.concept_id,
         CASE v.code_system
             WHEN 'http://loinc.org'       THEN 1
             WHEN 'http://snomed.info/sct' THEN 2
             ELSE 9
         END
)
-- Specificity dedup (f2o-036): drop an ancestor concept when the same report
-- also resolved to a more-specific descendant, to avoid double-counting.
SELECT r.* FROM resolved r
WHERE NOT EXISTS (
    SELECT 1 FROM resolved r2
    JOIN vocab.concept_ancestor ca
      ON ca.ancestor_concept_id   = r.std_concept_id
     AND ca.descendant_concept_id = r2.std_concept_id
    WHERE r2.id = r.id
      AND ca.ancestor_concept_id <> ca.descendant_concept_id
);

CREATE INDEX IF NOT EXISTS ix_diagnosticreport_resolved_domain ON staging.diagnosticreport_resolved (std_domain);
ANALYZE staging.diagnosticreport_resolved;
