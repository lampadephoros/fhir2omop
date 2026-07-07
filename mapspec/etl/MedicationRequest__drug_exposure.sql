-- Stage-2 ETL: MedicationRequest (FHIR R4) → drug_exposure (OMOP CDM)
--
-- RxNorm preferred (already standard OMOP Drug, Maps-to often self-map);
-- NDC fallback.
-- drug_type_concept_id 32838 'EHR prescription'.
-- start_date = end_date = authoredOn (we don't have dispense info here).
--
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/fhir-system-to-omop-vocab

-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/route-to-omop
WITH codes AS (
    SELECT id AS staging_id, 1 AS prio, 'RxNorm' AS vocab, code_rxnorm AS code FROM staging.medicationrequest_drug_exposure WHERE code_rxnorm IS NOT NULL
    UNION ALL
    SELECT id,                2,         'NDC',             code_ndc            FROM staging.medicationrequest_drug_exposure WHERE code_ndc    IS NOT NULL
    -- medicationReference → the referenced Medication's codes, via the
    -- Medication stage-1 view (staging.medication_drug_exposure). medication[x]
    -- is a choice, so these never compete with the inline branches above.
    UNION ALL
    SELECT v.id,              3,         'RxNorm',          m.drug_rxnorm       FROM staging.medicationrequest_drug_exposure v JOIN staging.medication_drug_exposure m ON m.id = v.medication_ref WHERE m.drug_rxnorm IS NOT NULL
    UNION ALL
    SELECT v.id,              4,         'NDC',             m.drug_ndc          FROM staging.medicationrequest_drug_exposure v JOIN staging.medication_drug_exposure m ON m.id = v.medication_ref WHERE m.drug_ndc    IS NOT NULL
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

    v.authored_on::date                                                     AS drug_exposure_start_date,
    v.authored_on::timestamp                                                AS drug_exposure_start_datetime,
    v.authored_on::date                                                     AS drug_exposure_end_date,
    v.authored_on::timestamp                                                AS drug_exposure_end_datetime,
    NULL::date                                                              AS verbatim_end_date,
    38000177                                                                AS drug_type_concept_id,   -- 'Prescription written'
    NULL::varchar                                                           AS stop_reason,
    NULL::integer                                                           AS refills,
    NULL::numeric                                                           AS quantity,
    NULL::integer                                                           AS days_supply,
    NULL::text                                                              AS sig,
    CASE WHEN v.route_code IS NOT NULL THEN COALESCE(rt.concept_id, 0) END AS route_concept_id,
    NULL::varchar                                                           AS lot_number,
    referenceToId(v.requester_ref)                                          AS provider_id,
    referenceToId(v.encounter_ref)                                          AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,
    left(r.src_code, 50)                                                    AS drug_source_value,
    r.src_concept_id                                                        AS drug_source_concept_id,
    left(v.route_code, 50)                                                  AS route_source_value,
    NULL::varchar                                                           AS dose_unit_source_value

FROM staging.medicationrequest_drug_exposure v
JOIN resolved r ON r.staging_id = v.id
LEFT JOIN cm.route_to_omop rt ON rt.source_code = v.route_code
-- Status filter: skip non-events (per OMOP convention drug_exposure
-- holds completed/active prescriptions, not cancelled drafts or
-- entered-in-error mistakes).
WHERE COALESCE(v.status, '') NOT IN ('entered-in-error', 'cancelled', 'draft', 'unknown')
;
