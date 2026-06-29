-- Stage-2 ETL: Observation → fact_relationship (TNM staging panel relationships)
--
-- Maps relationships between Stage Group observations and their member T, N, M category observations.
-- Populates relationship_concept_id with 44818790 (Has panel member) and 44818873 (Panel member of).

WITH unnested_members AS (
    SELECT
        v.id AS parent_id,
        v.std_concept_id AS parent_std_concept_id,
        unnest(string_to_array(v.has_members, ',')) AS child_id
    FROM staging.observation_resolved v
    WHERE v.has_members IS NOT NULL
)
SELECT
    27                                                                       AS domain_concept_id_1,
    stringToId(parent.id || '|' || parent.std_concept_id::text)              AS fact_id_1,
    CASE child.std_domain
        WHEN 'Observation' THEN 27
        WHEN 'Measurement' THEN 21
        ELSE 0
    END                                                                      AS domain_concept_id_2,
    stringToId(child.id || '|' || child.std_concept_id::text)                AS fact_id_2,
    44818790                                                                 AS relationship_concept_id
FROM unnested_members m
JOIN staging.observation_resolved parent
  ON parent.id = m.parent_id AND parent.std_concept_id = m.parent_std_concept_id
JOIN staging.observation_resolved child
  ON child.id = m.child_id
WHERE COALESCE(parent.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')
  AND COALESCE(child.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')

UNION ALL

SELECT
    CASE child.std_domain
        WHEN 'Observation' THEN 27
        WHEN 'Measurement' THEN 21
        ELSE 0
    END                                                                      AS domain_concept_id_1,
    stringToId(child.id || '|' || child.std_concept_id::text)                AS fact_id_1,
    27                                                                       AS domain_concept_id_2,
    stringToId(parent.id || '|' || parent.std_concept_id::text)              AS fact_id_2,
    44818873                                                                 AS relationship_concept_id
FROM unnested_members m
JOIN staging.observation_resolved parent
  ON parent.id = m.parent_id AND parent.std_concept_id = m.parent_std_concept_id
JOIN staging.observation_resolved child
  ON child.id = m.child_id
WHERE COALESCE(parent.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')
  AND COALESCE(child.status, 'final') NOT IN ('entered-in-error', 'cancelled', 'unknown')
;
