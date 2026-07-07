-- Stage-2 ETL: DocumentReference (FHIR R4) → note (OMOP CDM)
--
-- Residual / unstructured clinical content (progress note, discharge summary,
-- …) that has no structured OMOP home is routed to `note` rather than
-- discarded (f2o-081). One DocumentReference with a decodable text attachment
-- → one note row. LOINC document type → note_class_concept_id.
-- note_type_concept_id 32817 'EHR'. encoding_concept_id 32678 'UTF-8'.
-- language_concept_id 4180186 'English'.
--
-- DocumentReference.date is optional but note_date is NOT NULL in v5.4, so we
-- fall back to the linked Encounter.period.start via staging.encounter_visit
-- (the Encounter stage-1 view output — same cross-resource date pattern as
-- Condition). staging.encounter_visit is guaranteed to exist by the time this
-- runs: the resolve passes (which run before stage-2) create it as an
-- IF-NOT-EXISTS guard stub, and the Encounter view materializes it with data
-- when Encounters are present.

SELECT
    referenceToId(v.id)                                                     AS note_id,
    referenceToId(v.subject_ref)                                            AS person_id,
    COALESCE(v.doc_date, enc.period_start)::date                            AS note_date,
    COALESCE(v.doc_date, enc.period_start)::timestamp                       AS note_datetime,
    32817                                                                   AS note_type_concept_id,
    COALESCE(std.concept_id, 0)                                             AS note_class_concept_id,
    left(v.code_text, 250)                                                  AS note_title,
    COALESCE(convert_from(decode(v.attachment_data, 'base64'), 'UTF-8'), v.code_text, '')
                                                                            AS note_text,
    32678                                                                   AS encoding_concept_id,    -- 'UTF-8'
    4180186                                                                 AS language_concept_id,    -- 'English'
    referenceToId(v.author_practitioner_ref)                               AS provider_id,
    referenceToId(v.encounter_ref)                                         AS visit_occurrence_id,
    NULL::bigint                                                            AS visit_detail_id,
    left(v.code_loinc, 50)                                                  AS note_source_value,
    NULL::bigint                                                            AS note_event_id,
    NULL::integer                                                           AS note_event_field_concept_id

FROM staging.documentreference_note v
LEFT JOIN staging.encounter_visit enc
       ON enc.id = v.encounter_ref
LEFT JOIN vocab.concept src
       ON src.vocabulary_id = 'LOINC' AND src.concept_code = v.code_loinc
LEFT JOIN vocab.concept_relationship rel
       ON rel.concept_id_1 = src.concept_id AND rel.relationship_id = 'Maps to' AND rel.invalid_reason IS NULL
LEFT JOIN vocab.concept std
       ON std.concept_id = rel.concept_id_2 AND std.standard_concept = 'S'

-- Drop rows that can't satisfy NOT NULL person_id / note_date, or carry no text.
WHERE v.subject_ref IS NOT NULL
  AND COALESCE(v.doc_date, enc.period_start) IS NOT NULL
  AND (v.attachment_data IS NOT NULL OR v.code_text IS NOT NULL)
  AND COALESCE(v.status, 'current') NOT IN ('entered-in-error', 'superseded')
;
