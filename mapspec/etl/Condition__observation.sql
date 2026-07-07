-- Stage-2 ETL: Condition → observation (rows whose code routes to Observation domain)
--
-- Reads from staging.condition_resolved (built once by
-- mapspec/etl/_resolve_condition.sql). See sibling
-- Condition__condition_occurrence.sql for the full rationale.

SELECT
    stringToId(r.id || '|' || r.std_concept_id::text)                       AS observation_id,
    referenceToId(r.subject_ref)                                            AS person_id,
    r.std_concept_id                                                        AS observation_concept_id,

    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date)::date       AS observation_date,
    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date)::timestamp  AS observation_datetime,

    32827                                                                   AS observation_type_concept_id,
    NULL::numeric                                                           AS value_as_number,
    NULL::varchar                                                           AS value_as_string,
    NULL::integer                                                           AS value_as_concept_id,
    NULL::integer                                                           AS qualifier_concept_id,
    NULL::integer                                                           AS unit_concept_id,

    COALESCE(referenceToId(r.asserter_ref), referenceToId(r.recorder_ref))  AS provider_id,
    referenceToId(r.encounter_ref)                                          AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,

    left(COALESCE(r.src_code, r.code_text), 50)                            AS observation_source_value,
    r.src_concept_id                                                        AS observation_source_concept_id,
    NULL::varchar                                                           AS unit_source_value,
    NULL::varchar                                                           AS qualifier_source_value,
    NULL::varchar                                                           AS value_source_value,
    NULL::bigint                                                            AS observation_event_id,
    NULL::integer                                                           AS obs_event_field_concept_id

FROM staging.condition_resolved r
WHERE r.std_domain = 'Observation'
  AND COALESCE(r.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
  -- Drop rows that can't satisfy NOT NULL person_id / observation_date rather
  -- than aborting the whole INSERT (f2o-012 no-subject, f2o-070 no-date).
  AND r.subject_ref IS NOT NULL
  AND COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date) IS NOT NULL
;
