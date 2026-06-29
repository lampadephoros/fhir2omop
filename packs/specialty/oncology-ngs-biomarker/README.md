# Oncology NGS Biomarker Specialty Pack

This pack contains FHIR-to-OMOP mapping definitions and test specifications optimized for oncology datasets, Next-Generation Sequencing (NGS) reports, and tumor biopsy specimens.


## Mapping
 for the basic mapping of oncology diagnoses, genomic report text, and tumor specimens, you do not have to write new SQL-on-FHIR views or SQL ELT scripts.

These cases reuse the existing, core mapping pipelines:

- Oncology Diagnosis flows through the existing 
- Condition__condition_occurrence edge.
- Oncology NGS Reports flow through the existing 

DiagnosticReport__note
 edge.
Tumor Biopsy Details flow through the existing Specimen__specimen edge.



## Source-to-Target Mapping Logic

The following diagram illustrates the clinical data flow from FHIR R4 source resources to OMOP CDM v5.4 target tables:

```mermaid
graph TD
    subgraph fhir ["FHIR Source (R4)"]
        direction TB
        F_Pat[Patient]
        F_Cond[Condition]
        F_Spec[Specimen]
        F_DR[DiagnosticReport]
        F_Obs[Observation]
    end

    subgraph omop ["OMOP Target (v5.4)"]
        direction TB
        O_Per[person]
        O_Cond[condition_occurrence]
        O_Spec[specimen]
        O_Note[note]
        O_Meas[measurement]
        O_Obs[observation]
        O_Fact[fact_relationship]
    end


    F_Pat -->|Patient__person.sql| O_Per
    F_Cond -->|Condition__condition_occurrence.sql| O_Cond
    F_Cond -->|Condition__fact_relationship.sql| O_Fact
    F_Spec -->|Specimen__specimen.sql| O_Spec
    F_DR -->|DiagnosticReport__note.sql| O_Note
    F_Obs -->|Observation__observation.sql| O_Obs
    F_Obs -->|Observation__measurement.sql| O_Meas
    F_Obs -->|Observation__fact_relationship.sql| O_Fact
```

---

## Scope & Target Models

The pack covers four main mapping aspects to represent cancer patient data:

1. **Oncology Diagnosis (`condition--condition-occurrence--oncology-diagnosis.json`):**
   - **Clinical Simulation:** A patient diagnosed with primary lung cancer (adenocarcinoma of lung) and a secondary metastatic tumor in the brain.
   - **FHIR Input:** 
     - A primary `Condition` resource with the SNOMED code `254632001` ("Adenocarcinoma of lung"), status `active`, and verification status `confirmed`.
     - A secondary `Condition` resource with the SNOMED code `94225005` ("Secondary malignant neoplasm of brain"), carrying a `condition-related` extension referencing the primary diagnosis.
   - **OMOP Output:** 
     - One `condition_occurrence` row for the primary tumor mapped to standard concept `4115276` ("Adenocarcinoma of lung").
     - One `condition_occurrence` row for the brain metastasis mapped to standard concept `436659` ("Secondary malignant neoplasm of brain").
     - Two bidirectional `fact_relationship` rows with relationship concept IDs `44818854` ("Primary of") and `44818765` ("Metastasis of") linking the primary and secondary condition occurrences.
   - Maps cancer diagnoses (primary tumor site, histology, secondary metastatic sites) to the [OMOP CDM v5.4 condition_occurrence](https://ohdsi.github.io/CommonDataModel/cdm54.html#CONDITION_OCCURRENCE) and [fact_relationship](https://ohdsi.github.io/CommonDataModel/cdm54.html#FACT_RELATIONSHIP) tables.
   - Leverages ICD-O-3 and SNOMED-CT terminologies for tumor staging and grading.
   - Maps from [FHIR R4 Condition](https://hl7.org/fhir/R4/condition.html).
   - *Note: Shares the underlying pipeline and SQL logic defined in [`Condition__condition_occurrence.sql`](/mapspec/etl/Condition__condition_occurrence.sql) and [`Condition__fact_relationship.sql`](/mapspec/etl/Condition__fact_relationship.sql) with the core condition cases.*

2. **Oncology NGS Reports (`diagnosticreport--note--oncology-ngs.json`):**
   - **Clinical Simulation:** Recording the text output of a Next-Generation Sequencing (NGS) genomic panel report.
   - **FHIR Input:** A [`DiagnosticReport`](https://build.fhir.org/ig/HL7/genomics-reporting/StructureDefinition-genomic-report.html) with [LOINC](https://hl7.org/fhir/R4/valueset-report-codes.html) [code `11502-2`](https://loinc.org/11502-2) ("Laboratory report") and a textual variant summary in the `conclusion` field (*"Positive for somatic variants: EGFR p.L858R mutation detected."*).
   - **OMOP Output:** One `note` row where `note_text` contains the report's text findings verbatim, `note_type_concept_id` is set to `32817` ("EHR"), and language is verified as English (`4180186`).
   - Maps clinical genomics and NGS reports (somatic variants, gene fusions, copy number variations, TMB/MSI status) into the [OMOP CDM v5.4 note](https://ohdsi.github.io/CommonDataModel/cdm54.html#NOTE) table for raw report storage.
   - Bridges structured genomic assertions into the `observation` and `measurement` tables.
   - Maps from [FHIR R4 DiagnosticReport](https://hl7.org/fhir/R4/diagnosticreport.html) based on the [HL7 Clinical Genomics Reporting IG](http://hl7.org/fhir/uv/genomics-reporting/).
   - *Note: Shares the underlying pipeline and SQL logic defined in [`DiagnosticReport__note.sql`](/mapspec/etl/DiagnosticReport__note.sql) with the core diagnosticreport note cases.*

3. **Tumor Biopsy Details (`specimen--specimen--oncology-tumor-biopsy.json`):**
   - **Clinical Simulation:** Biopsy specimens collected from patients for oncology genetic testing, representing both liquid biopsy (blood draw) and solid tumor tissue biopsies with preservation details.
   - **FHIR Input:** 
     - A liquid `Specimen` of type SNOMED `119297000` ("Blood specimen"), collection body site SNOMED `368208006` ("Left upper arm structure"), and quantity `10 mL`.
     - A solid tissue `Specimen` of type SNOMED `258435002` ("Tissue specimen"), collection body site SNOMED `361362002` ("Structure of left upper lobe of lung"), quantity `5 mg`, and FFPE preservation processing (procedure SNOMED `434643000`).
     - A solid tissue `Specimen` of type SNOMED `258435002` ("Tissue specimen"), collection body site SNOMED `361362002` ("Structure of left upper lobe of lung"), quantity `3 mg`, and Frozen preservation processing (procedure SNOMED `429215003`).
   - **OMOP Output:** 
     - Liquid biopsy: `specimen_concept_id` = `4001225` ("Blood specimen"), `anatomic_site_concept_id` = `4283159` ("Left upper arm structure"), quantity = `10`.
     - FFPE tissue: `specimen_concept_id` = `4264660` ("Formalin-fixed paraffin-embedded tissue specimen"), `anatomic_site_concept_id` = `4031641` ("Structure of left upper lobe of lung"), quantity = `5`.
     - Frozen tissue: `specimen_concept_id` = `4264661` ("Frozen tissue specimen"), `anatomic_site_concept_id` = `4031641` ("Structure of left upper lobe of lung"), quantity = `3`.
   - Maps biopsy collection methods, anatomical sites (primary vs. metastatic tissue), and sample preservation to the [OMOP CDM v5.4 specimen](https://ohdsi.github.io/CommonDataModel/cdm54.html#SPECIMEN) table.
   - Maps from [FHIR R4 Specimen](https://hl7.org/fhir/R4/specimen.html).
   - *Note: Shares the underlying pipeline and SQL logic defined in [`Specimen__specimen.sql`](/mapspec/etl/Specimen__specimen.sql) with the core specimen cases.*

4. **Genomics & Staging Panels (`observation--measurement--genomics-staging.json`):**
   - **Clinical Simulation:** Structured genomic findings (somatic variants, TMB, MSI) and TNM staging panel linkages for cancer patients.
   - **FHIR Input:**
     - An `Observation` carrying EGFR p.L858R somatic mutation details (LOINC `48018-6` variant panel with `48005-3` Gene Studied = `"EGFR"` and `48004-6` DNA Change = `"p.L858R"` components).
     - An `Observation` carrying TMB level of `12.5 mut/Mb` (LOINC `94076-7`).
     - An `Observation` carrying MSI-High status (LOINC `81695-9` valueCodeableConcept `LA26284-4` "High").
     - A Pathological TNM Stage Group `Observation` (LOINC `21908-9` value SNOMED `371607005` "Stage IIIA") linked via `hasMember` to Pathological T (LOINC `21905-5`), N (LOINC `21906-3`), and M (LOINC `21907-1`) category observations.
   - **OMOP Output:**
     - EGFR Variant: One `observation` row mapped to LOINC `3011961` with `value_as_string` = `"p.L858R"` and `observation_source_value` = `"EGFR p.L858R"`.
     - TMB & MSI: Mapped to the `measurement` table with concepts `3027815` (TMB, `value_as_number` = `12.5`) and `3016431` (MSI, `value_as_concept_id` = `45878583` "High").
     - Stage Group & TNM categories: Mapped to the `observation` table. Links between Stage Group and T, N, M categories mapped to `fact_relationship` (relationship concept IDs `44818790` "Has panel member" and `44818873` "Panel member of").
   - Maps from [FHIR R4 Observation](https://hl7.org/fhir/R4/observation.html).
   - *Note: Shares the underlying pipeline and SQL logic defined in [`Observation__observation.sql`](/mapspec/etl/Observation__observation.sql), [`Observation__measurement.sql`](/mapspec/etl/Observation__measurement.sql), and [`Observation__fact_relationship.sql`](/mapspec/etl/Observation__fact_relationship.sql).*




 
