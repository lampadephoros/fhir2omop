-- Stage-2 ETL: MedicationAdministration (FHIR R4) → drug_exposure (OMOP CDM)
--
-- Appends to cdm_ours_fhir.drug_exposure (no TRUNCATE — must run after
-- MedicationRequest__drug_exposure.sql).
-- drug_type_concept_id 38000179 'Inpatient administration'.

-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/route-to-omop
WITH codes AS (
    SELECT id AS staging_id, 1 AS prio, 'RxNorm' AS vocab, code_rxnorm AS code FROM staging.medicationadministration_drug_exposure WHERE code_rxnorm IS NOT NULL
    UNION ALL
    SELECT id,                2,         'NDC',             code_ndc            FROM staging.medicationadministration_drug_exposure WHERE code_ndc    IS NOT NULL
    UNION ALL
    SELECT id,                3,         'SNOMED',          code_snomed         FROM staging.medicationadministration_drug_exposure WHERE code_snomed IS NOT NULL
    -- medicationReference → the referenced Medication's codes (see
    -- MedicationRequest__drug_exposure.sql for the rationale).
    UNION ALL
    SELECT v.id,              4,         'RxNorm',          m.drug_rxnorm       FROM staging.medicationadministration_drug_exposure v JOIN staging.medication_drug_exposure m ON m.id = v.medication_ref WHERE m.drug_rxnorm IS NOT NULL
    UNION ALL
    SELECT v.id,              5,         'NDC',             m.drug_ndc          FROM staging.medicationadministration_drug_exposure v JOIN staging.medication_drug_exposure m ON m.id = v.medication_ref WHERE m.drug_ndc    IS NOT NULL
),
resolved AS (
    SELECT DISTINCT ON (c.staging_id)
        c.staging_id, c.code AS src_code,
        src.concept_id AS src_concept_id,
        std.concept_id AS std_concept_id
    FROM codes c
    JOIN vocab.concept src
      ON src.vocabulary_id = c.vocab AND src.concept_code = c.code
    JOIN vocab.concept_relationship rel
      ON rel.concept_id_1 = src.concept_id AND rel.relationship_id = 'Maps to' AND rel.invalid_reason IS NULL
    JOIN vocab.concept std
      ON std.concept_id = rel.concept_id_2 AND std.standard_concept = 'S' AND std.domain_id = 'Drug'
    ORDER BY c.staging_id, c.prio
)

SELECT
    referenceToId(v.id)                                                     AS drug_exposure_id,
    referenceToId(v.subject_ref)                                            AS person_id,
    r.std_concept_id                                                        AS drug_concept_id,
    v.effective_dt::date                                                    AS drug_exposure_start_date,
    v.effective_dt::timestamp                                               AS drug_exposure_start_datetime,
    v.effective_dt::date                                                    AS drug_exposure_end_date,
    v.effective_dt::timestamp                                               AS drug_exposure_end_datetime,
    NULL::date                                                              AS verbatim_end_date,
    38000179                                                                AS drug_type_concept_id,
    NULL::varchar                                                           AS stop_reason,
    NULL::integer                                                           AS refills,
    NULL::numeric                                                           AS quantity,
    NULL::integer                                                           AS days_supply,
    NULL::text                                                              AS sig,
    CASE WHEN v.route_code IS NOT NULL THEN COALESCE(rt.concept_id, 0) END AS route_concept_id,
    NULL::varchar                                                           AS lot_number,
    NULL::bigint                                                            AS provider_id,
    referenceToId(v.encounter_ref)                                          AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,
    left(r.src_code, 50)                                                    AS drug_source_value,
    r.src_concept_id                                                        AS drug_source_concept_id,
    left(v.route_code, 50)                                                  AS route_source_value,
    NULL::varchar                                                           AS dose_unit_source_value

FROM staging.medicationadministration_drug_exposure v
JOIN resolved r ON r.staging_id = v.id
LEFT JOIN cm.route_to_omop rt ON rt.source_code = v.route_code
-- Skip non-events; treat NULL status as 'completed' (FHIR default).
WHERE COALESCE(v.status_code, 'completed') NOT IN ('entered-in-error', 'not-done', 'unknown')
;
