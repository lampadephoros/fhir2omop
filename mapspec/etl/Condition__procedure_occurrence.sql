-- Stage-2 ETL: Condition → procedure_occurrence
--
-- Reads from staging.condition_resolved (built once by _resolve_condition.sql).
-- See Condition__condition_occurrence.sql for rationale.

SELECT
    stringToId(r.id || '|' || r.std_concept_id::text)                       AS procedure_occurrence_id,
    referenceToId(r.subject_ref)                                            AS person_id,
    r.std_concept_id                                                        AS procedure_concept_id,

    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date)::date       AS procedure_date,
    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date)::timestamp  AS procedure_datetime,
    NULL::date                                                              AS procedure_end_date,
    NULL::timestamp                                                         AS procedure_end_datetime,

    32827                                                                   AS procedure_type_concept_id,
    NULL::integer                                                           AS modifier_concept_id,
    NULL::integer                                                           AS quantity,

    COALESCE(referenceToId(r.asserter_ref), referenceToId(r.recorder_ref))  AS provider_id,
    referenceToId(r.encounter_ref)                                          AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,

    left(COALESCE(r.src_code, r.code_text), 50)                            AS procedure_source_value,
    r.src_concept_id                                                        AS procedure_source_concept_id,
    NULL::varchar                                                           AS modifier_source_value

FROM staging.condition_resolved r
WHERE r.std_domain = 'Procedure'
  AND COALESCE(r.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
  -- Drop rows that can't satisfy NOT NULL person_id / procedure_date rather
  -- than aborting the whole INSERT (f2o-012 no-subject, f2o-070 no-date).
  AND r.subject_ref IS NOT NULL
  AND COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date) IS NOT NULL
;
