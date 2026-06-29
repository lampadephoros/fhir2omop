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

### Technical Implementation Tasks
<a name="task-1"></a>
1. **[MODIFY] [DiagnosticReport__measurement.view.json](/mapspec/views/DiagnosticReport__measurement.view.json):**
   * Update the JSON-on-FHIR view definition to traverse `DiagnosticReport.result` (references to nested `Observation` resources).
   * Extract the nested variant observation IDs, codes, and text-based values (such as `Observation.valueString` carrying the HGVS variant string `p.L858R`).
   * Extract the gene components (such as `EGFR` from `Observation.component`).
<a name="task-2"></a>
2. **[MODIFY] [_resolve_diagnosticreport.sql](/mapspec/etl/_resolve_diagnosticreport.sql):**
   * Update the staging resolver to parse and join the newly extracted nested variant codings through `cm.fhir_system_to_omop_vocab` to map them to standard OHDSI concepts.
<a name="task-3"></a>
3. **[MODIFY] [DiagnosticReport__observation.sql](/mapspec/etl/DiagnosticReport__observation.sql):**
   * Filter the resolved staging output where the target domain is `Observation`.
   * Insert rows into `cdm_ours_fhir.observation` mapping `observation_concept_id` to LOINC `48018-6`, `value_as_string` to the HGVS string, and `observation_source_value` to the raw HUGO/HGVS input string.

---
  
## 2. Metastatic Site Relationships

### Problem Description
1. **Hierarchy Loss:** FHIR represents primary and secondary (metastatic) tumor sites as separate `Condition` resources. In OMOP, they are represented as distinct, independent rows in `condition_occurrence`. *(Remediation: see [Task 1](#m-task-1) and [Task 2](#m-task-2))*
2. **Data Disconnection:** On write, the relational parent-child link between the primary cancer and its metastases is lost. This prevents researchers from tracing secondary site progression back to the primary origin. *(Remediation: see [Task 2](#m-task-2))*

### Remediation Proposal & OHDSI Rationale
* **Relational Linkage:** Populate the [OMOP CDM v5.4 fact_relationship](https://ohdsi.github.io/CommonDataModel/cdm54.html#FACT_RELATIONSHIP) table, linking the primary tumor `condition_occurrence_id` to the secondary tumor `condition_occurrence_id`.
* **Relationship Concept:** Use standard OHDSI relationship concepts (such as relationship concept ID `44818765` for "Metastasis of").
* **Why we suggest this:** Standard OHDSI Oncology conventions (see [OHDSI Oncology WG Disease Progression & Metastasis](https://ohdsi.github.io/Oncology/oncologyEpisode.html)) require the use of the `fact_relationship` table to preserve hierarchy and disease progression. Without this link, secondary diagnoses cannot be traced back to their primary site of origin, which is a prerequisite for cancer progression-free survival analyses and oncology clinical research.

### Technical Implementation Tasks
<a name="m-task-1"></a>
1. **[MODIFY] [Condition__condition_occurrence.view.json](/mapspec/views/Condition__condition_occurrence.view.json):**
   * Extract the linkage identifier pointing to the primary tumor from the FHIR `Condition.extension` representing related conditions (e.g. `http://hl7.org/fhir/StructureDefinition/condition-related`).
   * Output this value in a new staging column `primary_condition_ref`.
<a name="m-task-2"></a>
2. **[NEW] `Condition__fact_relationship.sql`:**
   * Create a new Stage-2 ETL script in `mapspec/etl/` to map the bidirectional primary-metastatic links into the `fact_relationship` table:
     * Perform a self-join on the resolved condition staging table to pair the metastatic `condition_occurrence_id` with its parent primary `condition_occurrence_id` (using `referenceToId()`).
     * Insert a pair of rows into `cdm_ours_fhir.fact_relationship` (Primary-to-Metastatic with concept `44818854` "Primary of", and Metastatic-to-Primary with concept `44818765` "Metastasis of").


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