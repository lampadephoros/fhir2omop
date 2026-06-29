# Oncology NGS Biomarker Mapping Gaps

This document tracks known discrepancies and mapping gaps between FHIR clinical genomics resources and the OMOP CDM v5.4 target representation, providing technical remediation proposals and implementation tasks.

---

## 1. Structured Genomic Variants in OMOP CDM v5.4

### Problem Description
1. **Schema Gaps:** OMOP CDM v5.4 lacks native, dedicated clinical genomics tables. Somerset clinical findings like somatic variants, HGVS strings, and amino acid changes have no direct structural target. *(Remediation: see [Task 1](#task-1), [Task 2](#task-2), and [Task 3](#task-3))*
2. **Loss of Detail:** Raw unstructured reports can be saved in the `note` table, but discrete details (e.g., specific mutations) are not standardly searchable if left as unstructured text. *(Remediation: see [Task 1](#task-1) and [Task 3](#task-3))*
3. **Terminology Resolution:** Genomic variant concepts (such as "EGFR p.L858R mutation detected") do not cleanly map to standard SNOMED-CT or LOINC concept codes. *(Remediation: see [Task 2](#task-2))*

### Remediation Proposal & OHDSI Rationale
* **Raw Report Storage:** Store the raw unstructured genomic report as a `note` record.
* **Variant Observations:** Map the structured variants into the `observation` table with `observation_concept_id` pointing to LOINC genomic concepts (e.g., [LOINC 48018-6 (Gene variant analysis)](https://loinc.org/48018-6/)), and store the HGVS string in the `value_as_string` column.
* **OHDSI Alignment:** In future database updates, align with the [OHDSI Oncology WG Genomic Extension](https://ohdsi.github.io/Oncology/genomics.html). The OHDSI Genomics WG specifies that until a dedicated genomic table structure is integrated into the core CDM, variant detections must be recorded in the `observation` table. Anchoring these variant detections to standard LOINC panels (such as `48018-6`) maintains consistency with standard observation querying guidelines while preserving structured genomic strings (HGVS, HGNC symbols) inside text-based columns.

### Technical Implementation Mappings (Completed)
1. **[MODIFY] [Observation__measurement.view.json](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/mapspec/views/Observation__measurement.view.json):**
   * Updated the JSON-on-FHIR view definition to extract nested variant codes/displays (such as gene symbol from LOINC `48005-3` and HGVS string from LOINC `48004-6`) and `hasMember` linkages (`has_members`).
2. **[MODIFY] [_resolve_observation.sql](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/mapspec/etl/_resolve_observation.sql):**
   * Updated the staging resolver to parse and propagate gene symbol, HGVS, and member references, adjusting the value-presence filters to retain empty genomic variant parents with components.
3. **[MODIFY] [Observation__observation.sql](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/mapspec/etl/Observation__observation.sql):**
   * Mapped HGVS changes to `value_as_string` and `value_source_value` under LOINC `48018-6`.
4. **[NEW] [Observation__fact_relationship.sql](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/mapspec/etl/Observation__fact_relationship.sql):**
   * Mapped TNM Stage Group panels to sub-observations using relationship concept IDs `44818790` and `44818873` in `fact_relationship`.

---
  
## 2. Metastatic Site Relationships

### Problem Description
1. **Hierarchy Loss:** FHIR represents primary and secondary (metastatic) tumor sites as separate `Condition` resources. In OMOP, they are represented as distinct, independent rows in `condition_occurrence`. *(Remediation: see completed tasks below)*
2. **Data Disconnection:** On write, the relational parent-child link between the primary cancer and its metastases is lost. This prevents researchers from tracing secondary site progression back to the primary origin. *(Remediation: see completed tasks below)*

### Remediation Proposal & OHDSI Rationale
* **Relational Linkage:** Populate the [OMOP CDM v5.4 fact_relationship](https://ohdsi.github.io/CommonDataModel/cdm54.html#FACT_RELATIONSHIP) table, linking the primary tumor `condition_occurrence_id` to the secondary tumor `condition_occurrence_id`.
* **Relationship Concept:** Use standard OHDSI relationship concepts (such as relationship concept ID `44818765` for "Metastasis of").
* **Why we suggest this:** Standard OHDSI Oncology conventions (see [OHDSI Oncology WG Disease Progression & Metastasis](https://ohdsi.github.io/Oncology/oncologyEpisode.html)) require the use of the `fact_relationship` table to preserve hierarchy and disease progression. Without this link, secondary diagnoses cannot be traced back to their primary site of origin, which is a prerequisite for cancer progression-free survival analyses and oncology clinical research.

### Technical Implementation Mappings (Completed)
1. **[MODIFY] [Condition__condition_occurrence.view.json](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/mapspec/views/Condition__condition_occurrence.view.json):**
   * Extracted primary tumor references from the FHIR `Condition.extension` representing related conditions.
2. **[NEW] [Condition__fact_relationship.sql](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/mapspec/etl/Condition__fact_relationship.sql):**
   * Created new Stage-2 ETL script to map bidirectional primary-metastatic links (`Primary of` and `Metastasis of`) into `fact_relationship`.


---

## References

1. [OHDSI Oncology WG GitHub Repository](https://github.com/OHDSI/OncologyWG)
2. [OHDSI Oncology WG Homepage](https://ohdsi.github.io/Oncology/)
3. [OHDSI Oncology Project Board](https://github.com/orgs/OHDSI/projects/13/views/1)
4. [OHDSI Oncology WG Conventions](https://ohdsi.github.io/Oncology/conventions.html)
5. [OHDSI Forum discussion on Oncology Extensions](https://forums.ohdsi.org/t/oncology-extension-cdm-v6-0/13666)
6. [HL7 FHIR Genomics Reporting Implementation Guide](http://hl7.org/fhir/uv/genomics-reporting/)
7. [OHDSI Oncology WG Genomic Extension](https://ohdsi.github.io/Oncology/genomics.html)



## target rules
For NGS biomarker:

1. Every clinically meaningful biomarker result must become an OMOP MEASUREMENT.
2. Every lossless variant detail must also go into ngs_variant.
3. Every NGS report/test must have lineage back to FHIR DiagnosticReport / Observation / Specimen.


For metastatic site:
Every metastatic site should be represented as:
  1. a secondary cancer CONDITION_OCCURRENCE when clinically asserted,
  2. a site modifier MEASUREMENT when site detail is needed,
  3. an EPISODE_EVENT link to the cancer episode,
  4. an oncology_metastasis_link row tying primary cancer, metastatic condition, site, specimen, and FHIR lineage together.