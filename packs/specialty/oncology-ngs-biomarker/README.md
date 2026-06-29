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
        F_Obs[Observation]
        F_DR[DiagnosticReport]
    end

    subgraph omop ["OMOP Target (v5.4)"]
        direction TB
        O_Per[person]
        O_Cond[condition_occurrence]
        O_Spec[specimen]
        O_Meas[measurement]
        O_Obs[observation]
        O_Fact[fact_relationship]
        O_Note[note]
    end


    F_Pat -->|Patient__person.sql| O_Per
    F_Cond -->|Condition__condition_occurrence.sql| O_Cond
    F_Cond -->|Condition__fact_relationship.sql| O_Fact
    F_Spec -->|Specimen__specimen.sql| O_Spec
    F_Obs -->|Observation__observation.sql| O_Obs
    F_Obs -->|Observation__measurement.sql| O_Meas
    F_Obs -->|Observation__fact_relationship.sql| O_Fact
    F_DR -->|DiagnosticReport__note.sql| O_Note
```

---

## Scope & Target Models

The pack covers four main mapping aspects to represent cancer patient data in chronological order:

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

2. **Tumor Biopsy Details (`specimen--specimen--oncology-tumor-biopsy.json`):**
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

3. **Genomics & Staging Panels (`observation--measurement--genomics-staging.json`):**
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

4. **Oncology NGS Reports (`diagnosticreport--note--oncology-ngs.json`):**
   - **Clinical Simulation:** Recording the text output of a Next-Generation Sequencing (NGS) genomic panel report.
   - **FHIR Input:** A [`DiagnosticReport`](https://build.fhir.org/ig/HL7/genomics-reporting/StructureDefinition-genomic-report.html) with [LOINC](https://hl7.org/fhir/R4/valueset-report-codes.html) [code `11502-2`](https://loinc.org/11502-2) ("Laboratory report") and a textual variant summary in the `conclusion` field (*"Positive for somatic variants: EGFR p.L858R mutation detected."*).
   - **OMOP Output:** One `note` row where `note_text` contains the report's text findings verbatim, `note_type_concept_id` is set to `32817` ("EHR"), and language is verified as English (`4180186`).
   - Maps clinical genomics and NGS reports (somatic variants, gene fusions, copy number variations, TMB/MSI status) into the [OMOP CDM v5.4 note](https://ohdsi.github.io/CommonDataModel/cdm54.html#NOTE) table for raw report storage.
   - Bridges structured genomic assertions into the `observation` and `measurement` tables.
   - Maps from [FHIR R4 DiagnosticReport](https://hl7.org/fhir/R4/diagnosticreport.html) based on the [HL7 Clinical Genomics Reporting IG](http://hl7.org/fhir/uv/genomics-reporting/).
   - *Note: Shares the underlying pipeline and SQL logic defined in [`DiagnosticReport__note.sql`](/mapspec/etl/DiagnosticReport__note.sql) with the core diagnosticreport note cases.*

---

## Detailed Entity-to-Table Field Mappings

Below are the detailed, field-level source-to-target mapping relationships for each clinical entity implemented in this specialty pack.

### 1. Patient Mapping (Demographics & Race/Ethnicity)

```mermaid
graph LR
    subgraph FHIR ["FHIR Patient"]
        F_id["id"]
        F_gender["gender"]
        F_birth["birthDate"]
        F_race["extension (us-core-race)"]
        F_eth["extension (us-core-ethnicity)"]
    end
    subgraph OMOP ["OMOP person"]
        O_psv["person_source_value"]
        O_gci["gender_concept_id"]
        O_gsv["gender_source_value"]
        O_yob["year/month/day_of_birth"]
        O_bdt["birth_datetime"]
        O_rci["race_concept_id"]
        O_rsv["race_source_value"]
        O_eci["ethnicity_concept_id"]
        O_esv["ethnicity_source_value"]
    end
    F_id --> O_psv
    F_gender --> O_gci
    F_gender --> O_gsv
    F_birth --> O_yob
    F_birth --> O_bdt
    F_race --> O_rci
    F_race --> O_rsv
    F_eth --> O_eci
    F_eth --> O_esv
```

**Process Flow & Scripts:**
1. **Stage-1 Flattening:** The JSON-on-FHIR view definition [`Patient__person.view.json`](/mapspec/views/Patient__person.view.json) extracts demographic fields from the raw FHIR `Patient` resource, unrolling US Core race and ethnicity extensions.
2. **Stage-2 ETL Mapping:** The SQL pipeline [`Patient__person.sql`](/mapspec/etl/Patient__person.sql) maps the extracted attributes:
   * Maps genders via the `cm.gender_to_omop` crosswalk.
   * Maps race concepts via `cm.race_omb_to_omop` (standard OMB) and `cm.race_text_synthea_to_omop` (narrative text fallbacks).
   * Maps ethnicity concepts via `cm.ethnicity_omb_to_omop`.
   * Inserts the resolved standard demographic attributes into `cdm_ours_fhir.person`.

---

### 2. Condition Mapping (Oncology Diagnosis & Metastatic Site Linkage)

```mermaid
graph LR
    subgraph FHIR ["FHIR Condition"]
        C_id["id"]
        C_code["code (SNOMED/ICD)"]
        C_onset["recordedDate / onsetDateTime"]
        C_abatement["abatementDateTime"]
        C_related["extension (condition-related)"]
    end
    subgraph OMOP_Diag ["OMOP condition_occurrence"]
        O_id["condition_occurrence_id"]
        O_cc["condition_concept_id"]
        O_csc["condition_source_concept_id"]
        O_csv["condition_source_value"]
        O_start["condition_start_date / datetime"]
        O_end["condition_end_date / datetime"]
    end
    subgraph OMOP_Fact ["OMOP fact_relationship"]
        O_f1["fact_id_1 (Primary Condition ID)"]
        O_f2["fact_id_2 (Metastatic Condition ID)"]
        O_rc["relationship_concept_id (Metastasis of / Primary of)"]
    end
    C_id --> O_id
    C_code --> O_cc
    C_code --> O_csc
    C_code --> O_csv
    C_onset --> O_start
    C_abatement --> O_end
    C_related --> O_f2
    C_id --> O_f1
    C_related --> O_rc
```

**Process Flow & Scripts:**
1. **Stage-1 Flattening:** The view definition [`Condition__condition_occurrence.view.json`](/mapspec/views/Condition__condition_occurrence.view.json) extracts codings, dates, and related condition references (`condition-related` extension) from the FHIR `Condition` resource.
2. **Stage-2 ETL Mapping:**
   * **Occurrence Mapping:** The SQL pipeline [`Condition__condition_occurrence.sql`](/mapspec/etl/Condition__condition_occurrence.sql) resolves diagnostic codes (SNOMED-CT, ICD-10-CM) to standard target concept IDs via `cm.fhir_system_to_omop_vocab` and writes rows to `cdm_ours_fhir.condition_occurrence`.
   * **Relationship Linkage:** The SQL pipeline [`Condition__fact_relationship.sql`](/mapspec/etl/Condition__fact_relationship.sql) performs a self-join on the staging table using the extracted `primary_condition_ref` and inserts primary-metastatic pairs (relationship concept IDs `44818854` and `44818765`) into `cdm_ours_fhir.fact_relationship`.

---

### 3. Specimen Mapping (Tumor Biopsy & Sample Preservation)

```mermaid
graph LR
    subgraph FHIR ["FHIR Specimen"]
        S_id["id"]
        S_type["type (SNOMED)"]
        S_site["collection.bodySite"]
        S_qty["collection.quantity"]
        S_proc["processing.procedure (FFPE/Frozen)"]
        S_date["collection.collectedDateTime"]
    end
    subgraph OMOP_Spec ["OMOP specimen"]
        O_id["specimen_id"]
        O_sval["specimen_source_value"]
        O_concept["specimen_concept_id (preservation details included)"]
        O_site["anatomic_site_concept_id"]
        O_sitsv["anatomic_site_source_value"]
        O_qty["quantity"]
        O_date["specimen_date / datetime"]
    end
    S_id --> O_id
    S_id --> O_sval
    S_type --> O_concept
    S_proc --> O_concept
    S_site --> O_site
    S_site --> O_sitsv
    S_qty --> O_qty
    S_date --> O_date
```

**Process Flow & Scripts:**
1. **Stage-1 Flattening:** The view definition [`Specimen__specimen.view.json`](/mapspec/views/Specimen__specimen.view.json) extracts specimen collection details (type, anatomic site, quantity, collection timestamp) and unrolls sample processing procedures.
2. **Stage-2 ETL Mapping:** The SQL pipeline [`Specimen__specimen.sql`](/mapspec/etl/Specimen__specimen.sql) resolves the specimen type, modified by the preservation processing method (e.g., mapping to FFPE tissue vs. Frozen tissue standard concepts), maps the anatomical site, and inserts standard records into `cdm_ours_fhir.specimen`.

---

### 4. Observation Mapping (Structured Genomic Findings & TNM Cancer Staging Panels)

```mermaid
graph LR
    subgraph FHIR ["FHIR Observation"]
        Ob_id["id"]
        Ob_code["code (LOINC)"]
        Ob_date["effectiveDateTime"]
        Ob_valQ["valueQuantity (TMB)"]
        Ob_valCC["valueCodeableConcept (MSI / Stage)"]
        Ob_comp["component (Gene studied, DNA change)"]
        Ob_member["hasMember (Stage Group panel members)"]
    end
    subgraph OMOP_Obs ["OMOP observation (Somatic Variants / TNM Staging)"]
        O_obs_id["observation_id"]
        O_obs_ci["observation_concept_id"]
        O_obs_val_s["value_as_string (HGVS code)"]
        O_obs_val_ci["value_as_concept_id (Stage concept)"]
        O_obs_src["observation_source_value (Gene + HGVS change)"]
        O_obs_date["observation_date / datetime"]
    end
    subgraph OMOP_Meas ["OMOP measurement (TMB / MSI Biomarkers)"]
        O_meas_id["measurement_id"]
        O_meas_ci["measurement_concept_id"]
        O_meas_num["value_as_number (TMB value)"]
        O_meas_val_ci["value_as_concept_id (MSI status concept)"]
        O_meas_unit["unit_source_value"]
        O_meas_date["measurement_date / datetime"]
    end
    subgraph OMOP_Fact ["OMOP fact_relationship (Staging Panel Links)"]
        O_fr_f1["fact_id_1 (Stage Group Obs ID)"]
        O_fr_f2["fact_id_2 (Component Obs ID)"]
        O_fr_rel["relationship_concept_id (Has panel member / Panel member of)"]
    end
    Ob_id --> O_obs_id
    Ob_id --> O_meas_id
    Ob_code --> O_obs_ci
    Ob_code --> O_meas_ci
    Ob_date --> O_obs_date
    Ob_date --> O_meas_date
    Ob_valQ --> O_meas_num
    Ob_valQ --> O_meas_unit
    Ob_valCC --> O_meas_val_ci
    Ob_valCC --> O_obs_val_ci
    Ob_comp --> O_obs_val_s
    Ob_comp --> O_obs_src
    Ob_member --> O_fr_f2
    Ob_id --> O_fr_f1
    Ob_member --> O_fr_rel
```

**Process Flow & Scripts:**
1. **Stage-1 Flattening:** The view definition [`Observation__measurement.view.json`](/mapspec/views/Observation__measurement.view.json) acts as a unified flattener, extracting observation values, component keys, and `hasMember` panel arrays.
2. **Stage-2 ETL Mapping:**
   * **Staging Resolver:** The SQL helper [`_resolve_observation.sql`](/mapspec/etl/_resolve_observation.sql) acts as a joint resolver, joining codings to standard OMOP vocabularies via `cm.fhir_system_to_omop_vocab` and cleaning up component values.
   * **Observation Routing:** The SQL pipeline [`Observation__observation.sql`](/mapspec/etl/Observation__observation.sql) filters resolved observations matching the Observation domain (somatic variants, Stage Group, and T, N, M categories) and inserts them into `cdm_ours_fhir.observation`.
   * **Measurement Routing:** The SQL pipeline [`Observation__measurement.sql`](/mapspec/etl/Observation__measurement.sql) filters resolved observations belonging to the Measurement domain (TMB and MSI) and inserts them into `cdm_ours_fhir.measurement`.
   * **Staging Panel Linkage:** The SQL pipeline [`Observation__fact_relationship.sql`](/mapspec/etl/Observation__fact_relationship.sql) unrolls the staging table's `has_members` array, linking TNM Stage Group records to T, N, M category rows in `cdm_ours_fhir.fact_relationship` via relationship concepts `44818790` and `44818873`.

---

### 5. DiagnosticReport Mapping (NGS Narrative Reports)

```mermaid
graph LR
    subgraph FHIR ["FHIR DiagnosticReport"]
        D_id["id"]
        D_code["code (LOINC 11502-2)"]
        D_date["effectiveDateTime"]
        D_conclusion["conclusion (Unstructured summary text)"]
        D_title["code.text"]
    end
    subgraph OMOP_Note ["OMOP note"]
        O_note_id["note_id"]
        O_note_date["note_date / datetime"]
        O_note_text["note_text"]
        O_note_title["note_title"]
        O_note_type["note_type_concept_id (EHR)"]
        O_note_class["note_class_concept_id (Lab report)"]
        O_note_src["note_source_value"]
    end
    D_id --> O_note_id
    D_code --> O_note_src
    D_date --> O_note_date
    D_conclusion --> O_note_text
    D_title --> O_note_title
    D_code --> O_note_class
```

**Process Flow & Scripts:**
1. **Stage-1 Flattening:** The view definition [`DiagnosticReport__note.view.json`](/mapspec/views/DiagnosticReport__note.view.json) extracts report conclusion summaries, codes, and dates from the raw FHIR `DiagnosticReport` resource.
2. **Stage-2 ETL Mapping:** The SQL pipeline [`DiagnosticReport__note.sql`](/mapspec/etl/DiagnosticReport__note.sql) structures the report text, resolves the report classification concepts (e.g. Laboratory report class concept), and inserts records into `cdm_ours_fhir.note`.





 
