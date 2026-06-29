# Specialty Pack — Oncology NGS Biomarker TODO & Plan

Status snapshot and task checklist of the mappings, test cases, and unresolved gaps associated with the Oncology NGS Biomarker specialty pack under `packs/specialty/oncology-ngs-biomarker/`.

---

## Done
 
 - [x] **Core Directory & Metadata** — defined pack schema, pack definition, README, and GAPS tracker
 - [x] **Verification Runner Support** — updated `script/run-cases.ts` to support `--pack` filtering and dynamic pack-specific seed loading
 - [x] **Pack-specific Vocab Seed** — isolated lung adenocarcinoma concepts (SNOMED `254632001` / concept `4115276`) under `packs/specialty/oncology-ngs-biomarker/_vocab_seed.sql`
 - [x] **Cases - Oncology Diagnosis** — golden case verifying lung cancer diagnosis (adenocarcinoma) maps to `condition_occurrence`
 - [x] **Cases - Oncology NGS Reports** — golden case verifying NGS reports base64 decode and map to `note`
 - [x] **Cases - Tumor Biopsy** — golden case verifying collection and anatomical sites map to `specimen`
 - [x] **Metastatic Site Linkage (Task 4 & 5)** — parsed related condition extensions and linked primary and metastatic condition occurrences in `fact_relationship`
 - [x] **Specimen Extraction Improvements (Task 6)** — supported tissue preservation methods (FFPE vs. Frozen) and mapped anatomical site structures for solid tumor biopsies
 - [x] **Structured Genomics & Cancer Staging Mappings (Task 3)** — mapped somatic variants (LOINC `48018-6`), quantitative biomarkers (TMB, MSI), and TNM Stage Group panel hierarchies to `observation`, `measurement`, and `fact_relationship` tables
 - [x] **Expand Oncology Biomarkers** — added test fixtures and cases for common NSCLC mutations (KRAS p.G12C mutation and EML4-ALK gene fusion) under `observation--measurement--genomics-staging.json`
 - [x] **Targeted Therapy Mappings (Drug Exposure)** — integrated targeted TKI (Osimertinib) and immunotherapeutic (Pembrolizumab) MedicationRequests to map to standard drug exposure records under `medicationrequest--drug-exposure--targeted-therapy.json`
 
 ---
 
 ## Open Issues
 
 *(No open issues currently outstanding. All core mapping goals and specialty oncology enhancements have been implemented and validated.)*

## In Progress

*(No tasks currently in progress.)*

---

## Next (Future Roadmap)

- [ ] **Oncology Episode Mappings (`episode` & `episode_event`)**
  * *Details:* Map patient longitudinal oncology journeys, diagnostic episodes, treatment phases, and lines of therapy into standard `episode` and link related clinical events (TKI exposures, biopsies) to episodes via `episode_event`.
- [ ] **Lossless Genomics Extension Mapping (`ngs_variant`)**
  * *Details:* Define and build mappings to custom variant occurrence tables (`ngs_variant`/`variant_occurrence`) to capture transcript names, genomic coordinates, and reference/alternate alleles without detail loss.
- [ ] **Anatomical Site Modifier Mappings**
  * *Details:* Map granular metastatic tumor anatomical site details (specific brain regions, lung lobes) as modifier measurements connected to primary diagnoses.
- [ ] **Oncology Metastasis Link Mapping (`oncology_metastasis_link`)**
  * *Details:* Create mappings for a custom or extended table tying primary cancer, metastatic condition, anatomical site, specimen, and FHIR resource lineage together to enable single-query cohort lookups.
- [ ] **Comprehensive Variant-to-Measurement Conversion**
  * *Details:* Ensure every clinically actionable biomarker result (e.g., specific mutations or deletions) is also stored in the standard `measurement` table to support standard OHDSI diagnostic/lab query tools.
- [ ] **Provenance & Source Lineage Mapping**
  * *Details:* Formally map the relationship and lineage linking OMOP target records back to their exact source FHIR resources (e.g., linking observation variants back to their DiagnosticReport notes) using `fact_relationship`.
- [ ] **Expanded Actionable Biomarkers Coverage**
  * *Details:* Add test fixtures, vocab seeds, and mapping cases for other major actionable oncogene panel biomarkers such as ROS1 fusions, RET fusions, BRAF V600E, and NTRK fusions.
- [ ] **MedicationAdministration Mappings (IV Chemotherapy)**
  * *Details:* Map in-clinic intravenous chemotherapy infusions (e.g., Paclitaxel, Carboplatin) from FHIR `MedicationAdministration` or `Procedure` resources to capture exact infusion dates and doses in `drug_exposure`.
- [ ] **Standardized Specimen Preservation & Collection Vocabulary**
  * *Details:* Enrich `_vocab_seed.sql` with detailed preservation, preparation, and collection codes (Fine Needle Aspiration vs. Core Needle Biopsy) to capture sample collection characteristics in the `specimen` table.
- [ ] **Automated Lines of Therapy (LoT) Post-processing**
  * *Details:* Design an ELT post-processing script to automatically group chronological `drug_exposure` records into distinct lines of therapy (1L, 2L, etc.) under the OHDSI Episode conventions.
 ---
 
 ## References
 
 - [HL7 FHIR Genomics Reporting Implementation Guide](http://hl7.org/fhir/uv/genomics-reporting/)
 - [OHDSI Oncology WG Genomic Extension](https://ohdsi.github.io/Oncology/genomics.html)
