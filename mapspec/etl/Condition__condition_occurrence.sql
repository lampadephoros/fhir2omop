-- Stage-2 ETL: Condition → condition_occurrence (per-coding fan-out)
--
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/fhir-clinical-status-to-omop
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/fhir-verification-status-to-omop
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/fhir-condition-category-to-omop
--
-- Reads from staging.condition_resolved which is built once per pipeline
-- run by mapspec/etl/_resolve_condition.sql (single 4-table vocab JOIN
-- shared with sibling edges __observation / __procedure_occurrence /
-- __measurement). Here we just filter by std_domain and project to the
-- condition_occurrence schema.
--
-- ─── Intentional deviations from the HL7 FHIR↔OMOP IG ─────────────
-- 1. Per-coding fan-out via the view + Maps-to dedup means one row per
--    (Condition.id, std_concept_id). Surrogate PK = stringToId(
--    Condition.id || '|' || std_concept_id).
-- 2. SNOMED codings whose Maps-to lands in a non-Condition domain
--    (Observation, Procedure, Measurement) are NOT dropped — they
--    route to the matching OMOP table via the sibling edges.
-- 3. verificationStatus drives condition_status_concept_id (preferred
--    over clinicalStatus, see review §4.4); verificationStatus in
--    ('refuted', 'entered-in-error') excludes the row entirely.
-- ──────────────────────────────────────────────────────────────────

SELECT
    stringToId(r.id || '|' || r.std_concept_id::text)                        AS condition_occurrence_id,
    referenceToId(r.subject_ref)                                             AS person_id,
    r.std_concept_id                                                         AS condition_concept_id,

    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date, r.encounter_start_dt)::date      AS condition_start_date,
    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date, r.encounter_start_dt)::timestamp AS condition_start_datetime,
    COALESCE(r.abatement_dt, r.abatement_period_end)::date                   AS condition_end_date,
    COALESCE(r.abatement_dt, r.abatement_period_end)::timestamp              AS condition_end_datetime,

    COALESCE(cat.concept_id, 32817)                                          AS condition_type_concept_id,
    COALESCE(NULLIF(vstat.concept_id, 0), NULLIF(cstat.concept_id, 0), 0)    AS condition_status_concept_id,

    left(r.abatement_string, 20)                                             AS stop_reason,
    COALESCE(referenceToId(r.asserter_ref), referenceToId(r.recorder_ref))   AS provider_id,
    referenceToId(r.encounter_ref)                                           AS visit_occurrence_id,
    NULL::bigint                                                             AS visit_detail_id,

    left(COALESCE(r.src_code, r.code_text), 50)                             AS condition_source_value,
    r.src_concept_id                                                         AS condition_source_concept_id,
    left(r.clinical_status_code, 50)                                         AS condition_status_source_value

FROM staging.condition_resolved r
LEFT JOIN cm.fhir_clinical_status_to_omop     cstat ON cstat.source_code = r.clinical_status_code
LEFT JOIN cm.fhir_verification_status_to_omop vstat ON vstat.source_code = r.verification_status_code
LEFT JOIN cm.fhir_condition_category_to_omop  cat   ON cat.source_code   = r.category_code
WHERE r.std_domain = 'Condition'
  AND COALESCE(r.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
  -- Drop resources that can't produce a valid OMOP row (NOT NULL person_id /
  -- condition_start_date) instead of aborting the whole INSERT: a subject-less
  -- Condition is invalid FHIR (f2o-012); a dateless one has no event date
  -- (f2o-070). Filtered out here rather than silently imputed.
  AND r.subject_ref IS NOT NULL
  AND COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date, r.encounter_start_dt) IS NOT NULL
;
