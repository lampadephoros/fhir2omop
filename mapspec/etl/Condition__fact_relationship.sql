-- Stage-2 ETL: Condition → fact_relationship (bidirectional metastasis links)
--
-- Maps primary-metastatic relationships between Condition occurrences.
-- Populates domain_concept_id_1/2 with 19 (Condition) and relationship_concept_id
-- with 44818854 (Primary of) and 44818765 (Metastasis of).

SELECT
    19                                                                       AS domain_concept_id_1,
    stringToId(primary_cond.id || '|' || primary_cond.std_concept_id::text)  AS fact_id_1,
    19                                                                       AS domain_concept_id_2,
    stringToId(meta_cond.id || '|' || meta_cond.std_concept_id::text)        AS fact_id_2,
    44818854                                                                 AS relationship_concept_id

FROM staging.condition_resolved meta_cond
JOIN staging.condition_resolved primary_cond
  ON primary_cond.id = meta_cond.primary_condition_ref
WHERE meta_cond.std_domain = 'Condition'
  AND primary_cond.std_domain = 'Condition'
  AND meta_cond.primary_condition_ref IS NOT NULL
  AND COALESCE(meta_cond.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
  AND COALESCE(primary_cond.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')

UNION ALL

SELECT
    19                                                                       AS domain_concept_id_1,
    stringToId(meta_cond.id || '|' || meta_cond.std_concept_id::text)        AS fact_id_1,
    19                                                                       AS domain_concept_id_2,
    stringToId(primary_cond.id || '|' || primary_cond.std_concept_id::text)  AS fact_id_2,
    44818765                                                                 AS relationship_concept_id

FROM staging.condition_resolved meta_cond
JOIN staging.condition_resolved primary_cond
  ON primary_cond.id = meta_cond.primary_condition_ref
WHERE meta_cond.std_domain = 'Condition'
  AND primary_cond.std_domain = 'Condition'
  AND meta_cond.primary_condition_ref IS NOT NULL
  AND COALESCE(meta_cond.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
  AND COALESCE(primary_cond.verification_status_code, 'confirmed') NOT IN ('refuted', 'entered-in-error')
;
