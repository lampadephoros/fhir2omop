-- Stage-2 ETL: Condition → measurement
--
-- Reads from staging.condition_resolved (built once by _resolve_condition.sql).
-- See Condition__condition_occurrence.sql for rationale.

SELECT
    stringToId(r.id || '|' || r.std_concept_id::text)                       AS measurement_id,
    referenceToId(r.subject_ref)                                            AS person_id,
    r.std_concept_id                                                        AS measurement_concept_id,

    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date)::date       AS measurement_date,
    COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date)::timestamp  AS measurement_datetime,
    NULL::varchar                                                           AS measurement_time,

    32827                                                                   AS measurement_type_concept_id,
    NULL::integer                                                           AS operator_concept_id,
    NULL::numeric                                                           AS value_as_number,
    NULL::integer                                                           AS value_as_concept_id,
    NULL::integer                                                           AS unit_concept_id,
    NULL::numeric                                                           AS range_low,
    NULL::numeric                                                           AS range_high,

    COALESCE(referenceToId(r.asserter_ref), referenceToId(r.recorder_ref))  AS provider_id,
    referenceToId(r.encounter_ref)                                          AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,

    left(COALESCE(r.src_code, r.code_text), 50)                            AS measurement_source_value,
    r.src_concept_id                                                        AS measurement_source_concept_id,
    NULL::varchar                                                           AS unit_source_value,
    NULL::integer                                                           AS unit_source_concept_id,
    NULL::varchar                                                           AS value_source_value,
    NULL::bigint                                                            AS measurement_event_id,
    NULL::integer                                                           AS meas_event_field_concept_id

FROM staging.condition_resolved r
WHERE r.std_domain = 'Measurement'
  AND COALESCE(r.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
  -- Drop rows that can't satisfy NOT NULL person_id / measurement_date rather
  -- than aborting the whole INSERT (f2o-012 no-subject, f2o-070 no-date).
  AND r.subject_ref IS NOT NULL
  AND COALESCE(r.onset_dt, r.onset_period_start, r.recorded_date) IS NOT NULL
;
