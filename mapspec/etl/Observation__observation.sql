-- Stage-2 ETL: Observation → observation (rows whose code routes to Observation domain)
--
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/fhir-system-to-omop-vocab
--
-- Reads from staging.observation_resolved (built once by
-- mapspec/etl/_resolve_observation.sql). Sibling to
-- Observation__measurement.sql — see it for the full rationale. Here we
-- filter std_domain='Observation' and project to the observation schema.
--
-- qualifier_concept_id is left NULL (we keep the raw interpretation code in
-- qualifier_source_value); resolving it to a standard concept is a follow-up.

SELECT
    stringToId(r.id || '|' || r.std_concept_id::text)                       AS observation_id,
    referenceToId(r.subject_id)                                             AS person_id,
    r.std_concept_id                                                        AS observation_concept_id,

    COALESCE(r.effective_dt, r.effective_period_start)::date                AS observation_date,
    COALESCE(r.effective_dt, r.effective_period_start)::timestamp           AS observation_datetime,

    32817                                                                   AS observation_type_concept_id,
    r.value_number                                                          AS value_as_number,
    CASE
        WHEN r.std_concept_id = 3011961 THEN left(r.hgvs_string, 60)
        ELSE left(r.value_string, 60)
    END                                                                     AS value_as_string,
    r.value_as_concept_id                                                   AS value_as_concept_id,
    NULL::integer                                                           AS qualifier_concept_id,
    r.unit_concept_id                                                       AS unit_concept_id,

    referenceToId(r.performer_id)                                           AS provider_id,
    referenceToId(r.encounter_id)                                           AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,

    CASE
        WHEN r.std_concept_id = 3011961 THEN left(COALESCE(r.gene_symbol || ' ' || r.hgvs_string, r.src_code, r.code_text), 50)
        ELSE left(COALESCE(r.src_code, r.code_text), 50)
    END                                                                     AS observation_source_value,
    r.src_concept_id                                                        AS observation_source_concept_id,
    left(r.value_unit_text, 50)                                             AS unit_source_value,
    left(r.qualifier_code, 50)                                              AS qualifier_source_value,
    CASE
        WHEN r.std_concept_id = 3011961 THEN left(r.hgvs_string, 50)
        ELSE left(r.value_text, 50)
    END                                                                     AS value_source_value,
    NULL::bigint                                                            AS observation_event_id,
    NULL::integer                                                           AS obs_event_field_concept_id

FROM staging.observation_resolved r
WHERE r.std_domain = 'Observation'
;
