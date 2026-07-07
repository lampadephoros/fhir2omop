-- Stage-2 ETL: Procedure (FHIR R4) → procedure_occurrence (OMOP CDM)
--
-- Code priority SNOMED → CPT4 → HCPCS → ICD10PCS via UNION ALL +
-- DISTINCT ON.  Domain routing: keep only standard concepts with
-- domain_id='Procedure'.

WITH codes AS (
    SELECT id AS staging_id, 1 AS prio, 'SNOMED'   AS vocab, code_snomed   AS code FROM staging.procedure_occurrence WHERE code_snomed   IS NOT NULL
    UNION ALL
    SELECT id,                2,         'CPT4',             code_cpt4            FROM staging.procedure_occurrence WHERE code_cpt4     IS NOT NULL
    UNION ALL
    SELECT id,                3,         'HCPCS',            code_hcpcs           FROM staging.procedure_occurrence WHERE code_hcpcs    IS NOT NULL
    UNION ALL
    SELECT id,                4,         'ICD10PCS',         code_icd10pcs        FROM staging.procedure_occurrence WHERE code_icd10pcs IS NOT NULL
),
resolved AS (
    SELECT DISTINCT ON (c.staging_id)
        c.staging_id,
        c.code            AS src_code,
        src.concept_id    AS src_concept_id,
        std.concept_id    AS std_concept_id
    FROM codes c
    JOIN vocab.concept src
      ON src.vocabulary_id = c.vocab
     AND src.concept_code  = c.code
    JOIN vocab.concept_relationship rel
      ON rel.concept_id_1   = src.concept_id
     AND rel.relationship_id = 'Maps to'
     AND rel.invalid_reason IS NULL
    JOIN vocab.concept std
      ON std.concept_id      = rel.concept_id_2
     AND std.standard_concept = 'S'
     AND std.domain_id       = 'Procedure'
    ORDER BY c.staging_id, c.prio
),
-- Codes that resolve to a Standard concept in ANY domain. Used to tell a
-- genuinely-unmapped code (→ concept_id 0 row, f2o-032) apart from a code that
-- resolves fine but to a non-Procedure domain (→ intentionally dropped, e.g.
-- variant (c): a SNOMED that Maps-to a Condition). Only the former gets the
-- zero-fallback row.
mapped_any AS (
    SELECT DISTINCT c.staging_id
    FROM codes c
    JOIN vocab.concept src
      ON src.vocabulary_id = c.vocab AND src.concept_code = c.code
    JOIN vocab.concept_relationship rel
      ON rel.concept_id_1 = src.concept_id AND rel.relationship_id = 'Maps to' AND rel.invalid_reason IS NULL
    JOIN vocab.concept std
      ON std.concept_id = rel.concept_id_2 AND std.standard_concept = 'S'
)

SELECT
    referenceToId(v.id)                                                       AS procedure_occurrence_id,
    referenceToId(v.subject_ref)                                              AS person_id,

    COALESCE(r.std_concept_id, 0)                                             AS procedure_concept_id,

    -- procedures.csv stores UTC ("…Z"); FHIR carries local TZ ("…+01:00") —
    -- same alignment as Encounter. Normalize to UTC instant.
    (COALESCE(v.performed_dt, v.performed_period_start)::timestamptz AT TIME ZONE 'UTC')::date AS procedure_date,
    (COALESCE(v.performed_dt, v.performed_period_start)::timestamptz AT TIME ZONE 'UTC')       AS procedure_datetime,
    (v.performed_period_end::timestamptz AT TIME ZONE 'UTC')::date                             AS procedure_end_date,
    (v.performed_period_end::timestamptz AT TIME ZONE 'UTC')                                   AS procedure_end_datetime,

    32827                                                                     AS procedure_type_concept_id,   -- 'EHR encounter record'
    NULL::integer                                                             AS modifier_concept_id,
    NULL::integer                                                             AS quantity,
    referenceToId(v.performer_ref)                                            AS provider_id,
    referenceToId(v.encounter_ref)                                            AS visit_occurrence_id,
    NULL::bigint                                                              AS visit_detail_id,

    left(COALESCE(r.src_code, v.code_any, v.code_text), 50)                   AS procedure_source_value,
    COALESCE(r.src_concept_id, 0)                                             AS procedure_source_concept_id,
    NULL::varchar                                                             AS modifier_source_value

FROM staging.procedure_occurrence v
LEFT JOIN resolved r ON r.staging_id = v.id
WHERE COALESCE(v.status, 'completed') NOT IN ('entered-in-error', 'not-done', 'unknown')
  -- NOT NULL guards (f2o-012 / f2o-070): drop rows that can't satisfy
  -- person_id / procedure_date instead of aborting the whole INSERT.
  AND v.subject_ref IS NOT NULL
  AND COALESCE(v.performed_dt, v.performed_period_start) IS NOT NULL
  -- Keep the row when it resolved to a Procedure concept, OR when the code
  -- resolves to NO Standard concept at all (unmapped → concept_id 0, f2o-032).
  -- A code that resolves to a non-Procedure domain is dropped here (variant c).
  AND (r.staging_id IS NOT NULL OR v.id NOT IN (SELECT staging_id FROM mapped_any))
;
