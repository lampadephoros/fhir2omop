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
 
 ---
 
 ## Open Issues
 
 *(No open issues currently outstanding. All core mapping goals and specialty oncology enhancements have been implemented and validated.)*
 
 ---
 
## Next (Future Roadmap)

- [ ] **Targeted Therapy Mappings (Drug Exposure)** — Integrate the clinical case narrative with treatment records (e.g., mapping TKI prescriptions or immunotherapy administrations to `drug_exposure`).
- [ ] **Expand Oncology Biomarkers** — Add test fixtures and cases for other common biomarkers like ALK gene fusions (e.g., EML4-ALK) or KRAS mutations.
 
 ---
 
 ## References
 
 - [HL7 FHIR Genomics Reporting Implementation Guide](http://hl7.org/fhir/uv/genomics-reporting/)
 - [OHDSI Oncology WG Genomic Extension](https://ohdsi.github.io/Oncology/genomics.html)
