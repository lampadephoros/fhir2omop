-- Stage-2 ETL: Observation → measurement (rows whose code routes to Measurement domain)
--
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/fhir-system-to-omop-vocab
--
-- Reads from staging.observation_resolved, built once per pipeline run by
-- mapspec/etl/_resolve_observation.sql (single 4-table vocab JOIN + value /
-- unit / operator resolution, shared with the sibling Observation__observation
-- via per-coding fan-out and std_domain routing). Here we just filter by
-- std_domain and project to the measurement schema — same shape as the
-- Condition family.
--
-- Surrogate PK = stringToId(Observation.id || '|' || std_concept_id) so the
-- per-coding fan-out (one row per distinct standard concept) stays unique.

SELECT
    stringToId(r.id || '|' || r.std_concept_id::text)                       AS measurement_id,
    referenceToId(r.subject_id)                                             AS person_id,
    r.std_concept_id                                                        AS measurement_concept_id,

    COALESCE(r.effective_dt, r.effective_period_start)::date                AS measurement_date,
    COALESCE(r.effective_dt, r.effective_period_start)::timestamp           AS measurement_datetime,
    NULL::varchar                                                           AS measurement_time,

    CASE WHEN r.category_code = 'laboratory' THEN 32856 ELSE 32817 END       AS measurement_type_concept_id,
    r.operator_concept_id                                                   AS operator_concept_id,
    r.value_number                                                          AS value_as_number,
    r.value_as_concept_id                                                   AS value_as_concept_id,
    r.unit_concept_id                                                       AS unit_concept_id,
    r.range_low                                                             AS range_low,
    r.range_high                                                            AS range_high,

    referenceToId(r.performer_id)                                           AS provider_id,
    referenceToId(r.encounter_id)                                           AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,

    left(COALESCE(r.src_code, r.code_text), 50)                             AS measurement_source_value,
    r.src_concept_id                                                        AS measurement_source_concept_id,
    left(r.value_unit_text, 50)                                             AS unit_source_value,
    NULL::integer                                                           AS unit_source_concept_id,
    left(r.value_text, 50)                                                  AS value_source_value,
    NULL::bigint                                                            AS measurement_event_id,
    NULL::integer                                                           AS meas_event_field_concept_id

FROM staging.observation_resolved r
WHERE r.std_domain = 'Measurement'
  -- Drop rows that can't satisfy NOT NULL person_id / measurement_date rather
  -- than aborting the whole INSERT (f2o-012 no-subject, f2o-070 no-date).
  AND r.subject_id IS NOT NULL
  AND COALESCE(r.effective_dt, r.effective_period_start) IS NOT NULL
;
