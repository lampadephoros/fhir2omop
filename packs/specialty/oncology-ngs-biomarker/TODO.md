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

---

## Open Issues

### 1. Structured Genomic Variants in OMOP (see [GAPS.md Section 1](GAPS.md#1-structured-genomic-variants-in-omop-cdm-v54))
- OMOP CDM v5.4 lacks native clinical genomics tables, requiring variants to be mapped into the general `observation` table.
- Genomic concepts (e.g., EGFR somatic mutations) do not cleanly map to standard SNOMED or LOINC codes, requiring LOINC `48018-6` anchoring and HGVS value strings.

### 2. Metastatic Site Relationships (Resolved)
- **Resolved:** Primary and secondary (metastatic) tumor sites are now linked bidirectionally in the `fact_relationship` table using standard OHDSI relationships ("Primary of" / "Metastasis of") derived from the FHIR `condition-related` extension.

---

## Next (Implementation Tasks)

### 1. Structured Genomic Variants Mapping
- [ ] **Task 1: Traversal & Extraction** — Modify [`DiagnosticReport__measurement.view.json`](/mapspec/views/DiagnosticReport__measurement.view.json) to extract nested observation IDs, HGVS strings, and gene symbols from `DiagnosticReport.result`.
  - [ ] *Support diverse payload types (base64, compressed, or plain text) [Improvement 7]*
  - [ ] *Parse complex structural variants/gene fusions (e.g., EML4-ALK) [Improvement 9]*
- [ ] **Task 2: Resolve Expansion** — Update [`_resolve_diagnosticreport.sql`](/mapspec/etl/_resolve_diagnosticreport.sql) to join and resolve nested variant codings through `cm.fhir_system_to_omop_vocab`.
  - [ ] *Filter out invalid/cancelled report statuses (e.g., entered-in-error) [Improvement 8]*
- [ ] **Task 3: Observation Insertion** — Modify [`DiagnosticReport__observation.sql`](/mapspec/etl/DiagnosticReport__observation.sql) to map variant domain codings into `cdm_ours_fhir.observation` under LOINC `48018-6` with HGVS values [Improvement 1].
  - [ ] *Map quantitative genomic biomarkers (TMB, MSI) to measurements [Improvement 5]*
  - [ ] *Map TNM cancer staging using mCODE observation profiles [Improvement 4]*

### 2. Metastatic Site Linkage
- [x] **Task 4: Relationship View Extraction** — Modify [`Condition__condition_occurrence.view.json`](/mapspec/views/Condition__condition_occurrence.view.json) to parse the related condition extension (`http://hl7.org/fhir/StructureDefinition/condition-related`) and populate `primary_condition_ref`.
  - [x] *Verify correct classification of primary vs. secondary (metastatic) tumor sites [Improvement 2]*
- [x] **Task 5: Linkage ETL Execution** — Create the new Stage-2 ETL script `Condition__fact_relationship.sql` in `mapspec/etl/` to map the bidirectional primary-metastatic links into the `fact_relationship` table.
  - [x] *Populate bidirectional metastasis links ("Primary of" / "Metastasis of") [Improvement 3]*

### 3. Specimen Extraction Improvements
- [ ] **Task 6: Specimen Preservation & Site Mapping** — Expand [`Specimen__specimen.sql`](/mapspec/etl/Specimen__specimen.sql) and the Stage-1 view to support advanced sample traits.
  - [ ] *Support tissue preservation methods (FFPE vs. Frozen) [Improvement 6]*
  - [ ] *Map complex anatomical site hierarchies (e.g., left upper lung lobe needle biopsy) [Improvement 10]*

---

## References

- [HL7 FHIR Genomics Reporting Implementation Guide](http://hl7.org/fhir/uv/genomics-reporting/)
- [OHDSI Oncology WG Genomic Extension](https://ohdsi.github.io/Oncology/genomics.html)
