# Source-code → OMOP concept mapping: who does it how

**Date:** 2026-07-03
**Method:** two multi-agent surveys, every finding adversarially verified by an
independent agent re-reading the cited files / re-fetching the cited URLs.

1. **Local sweep** — all 40 reference implementations under `refs/refs/` +
   `tmp/mimic/code/` (per-repo mechanism classification with file:line evidence).
2. **Web survey** — published papers, vendor platforms, OHDSI tooling,
   terminology servers, community governance (verbatim quotes with URLs).

Coverage note: three web directions (research networks N3C/AoU/EHDEN deep-dive,
national programs deep-dive, LLM-assisted mapping) failed on an API content
filter and are only partially covered via adjacent directions (All of Us HIN
pilot via papers; UK Biobank/EHDEN via tooling; German MII via papers).

---

## 1. Taxonomy of mapping carriers

| Kind | Definition |
|---|---|
| `athena-walk` | JOIN `concept` + `concept_relationship 'Maps to'` (+ `invalid_reason IS NULL`) |
| `stcm` | `source_to_concept_map` table joined at ETL time |
| `custom-2b` | local codes inserted into `CONCEPT` with `concept_id ≥ 2,000,000,000` + Maps-to |
| `fhir-conceptmap` | FHIR ConceptMap artifacts / `$translate` |
| `terminology-server` | remote FHIR TS in the ETL path |
| `csv-lookup` | external crosswalk files joined at ETL time |
| `hardcoded` | switch/CASE in code |
| `none` | no mapping (raw codes or concept_id=0 everywhere) |

## 2. The consensus layer (everyone agrees)

- **The data is Athena.** Every serious implementation resolves through the
  same `'Maps to'` walk; carriers differ, the walk does not.
- **Domain routing is doctrine.** The standard concept's `domain_id` picks the
  target table (Book of OHDSI ch.5; HL7 IG codemappings: "vocabulary-driven
  approach that prioritizes semantic accuracy over structural assumptions based
  on FHIR resource types"; CodeX cookbook calls it an axiom). Production proof:
  CareEvolution routes ~19% of Conditions to `observation`.
  Instructive gap: the HL7 IG's own executable FML StructureMaps route by FHIR
  `category` because FML cannot express the vocab walk — the prose doctrine is
  implementable only in SQL/code layers like ours.
- **Unmapped → emit the row with `concept_id = 0`, never drop.** CDM FAQ:
  "so as to preserve the record from the native data"; HL7 IG: "the OMOP
  convention for an unmapped concept"; Philofsky (2025): load-then-remediate.
  Violations are called out as defects (ETL-Synthea's silent INNER-JOIN drops).
- **`*_source_concept_id` = real Athena id of the source code in its native
  vocabulary, else 0 — never a copy of the target.** The copy-target-into-source
  anti-pattern is documented in NACHC (`OmopPersonBuilder.java:69-70`), GT-FHIR2
  (`OmopObservation`), fhir-to-omop-demo (`Observation.jq:168`), and the old
  Vulcan mapping xlsx; the HL7 IG *removed* such mappings during ballot
  reconciliation (FHIR-52014).

## 3. Where they diverge — the carrier (matrix)

### Reference implementations (local sweep, refs/refs/)

| Implementation | Stack / direction | Dominant carrier(s) | Notes |
|---|---|---|---|
| FhirToCdm (OHDSI) | C#, fhir→omop | athena-walk (+stcm union) | per-vocab `Lookups/*.sql` cached in RAM; unknown Coding.system **crashes the run**; demographics hardcoded on display text |
| ETL-German-FHIR-Core (MII) | Java, fhir→omop | athena-walk + **stcm** | prebuilt lookup matviews **with validity windows**; ICD-10-GM/OPS/ATC-DE via STCM; concept_id=0 + log |
| NACHC | Java, fhir→omop | athena-walk + **custom-2b on the fly** | auto-INSERTs 2B concepts during ETL, no Maps-to, cleanup deletes >2e9; copies target→source concept ids |
| OMOPonFHIR family (GT) | Java, bidirectional | hardcoded + custom-2b runtime loader | @Scheduled(60s) CSV ingester mutating vocab tables; $translate via SQL LIKE on relationship names |
| GT-FHIR/GT-FHIR2 | Java, bidirectional | athena-walk + csv-lookup | code-only `LIKE :code` lookup (no vocab key — collision hazard); OMB race map shipped as SQLite in the jar |
| MENDS-on-FHIR | Whistle, omop→fhir | **fhir-conceptmap** | 13 ConceptMap JSONs incl. concept_id-keyed ones; graded Default/Null/Override miss-handling |
| ETL-Synthea | R+SQL, classic | athena-walk (+stcm slot) | materializes walk into `source_to_standard_vocab_map`; **drops unmapped (INNER JOIN)** — a defect vs doctrine |
| OHDSI/MIMIC | SQL, classic | custom-2b + csv-lookup (22 gcpt_*.csv) | value-through-custom-vocab domain routing produced the rhythms-as-conditions pathology (see OHDSI/MIMIC#67) |
| Avalon | dbt/BigQuery, fhir→omop | athena-walk materialized | pre-joined `concept_map` view shipped as a BigQuery data product |
| HL7 FHIR→OMOP IG v1.0.0 (Apr 2026, Informative) | spec | terminology-server (prescribed) + fhir-conceptmap + athena-walk | 14 FSH ConceptMaps for admin vocabs; custom-2b sanctioned as *temporary* escape hatch; bans `concept_name LIKE`; **zero STCM/Usagi mentions** |
| CodeX cookbook | spec | stcm ≡ fhir-conceptmap | verbatim: "The FHIR concept map is equivalent to the source-to-concept-map table in OMOP CDM" |
| HealthcareLakeETL | PySpark | **none** | `withColumnRenamed(code → concept_id)` — the null hypothesis our cm.* design exists to prevent |

### Real-world adopters (web survey)

| Adopter | Direction | Carrier(s) | Published numbers |
|---|---|---|---|
| **Microsoft Fabric** healthcare data solutions | fhir→omop | athena-walk + csv-lookup + custom-2b | CDM v5.4; Athena pinned v20221031; custom vocabs appended as Athena-format CSVs from 2,000,000,001; bridge table `fhir_system_to_omop_vocab_mapping` (fhir_uri → vocabulary_id) — same idea/name as our `cm.fhir_system_to_omop_vocab` |
| **InterSystems OMOP** (IRIS SaaS, AWS partner path) | fhir→omop | athena-walk + csv-lookup | 14 FHIR resources → 10 OMOP tables, domain-based fan-out |
| **Oracle Health LHN / EHR Real-World Data** | x→omop | athena-walk + custom-2b | 100+ health systems; custom mappings for Millennium terms |
| **Google Cloud** | fhir→omop | fhir-conceptmap + hardcoded (reference Whistle configs only) | no managed product; Odysseus is the named conversion partner |
| **AWS / Databricks dbignite** | — | none | no first-party mapping; dbignite doesn't populate concept_ids at all |
| **CareEvolution** Orchestrate / Rosetta (OHDSI 2025) | fhir→omop | terminology-server (proprietary), **explicitly rejected STCM** — "column length constraints that cannot reliably accommodate FHIR codesystem URLs as vocabulary IDs" | 2.8M FHIR resources → 1.1M OMOP rows; >99% non-duplicate resources produced rows; ~19% Conditions → observation; concept_id=0 + PROCESSING_LOG lineage |
| **German MII** (Peng 2022 IJMI, Henke 2023 JMIR) | fhir→omop | athena-walk + stcm | 10 university hospitals; DQD 99% conformance; incremental load −87.5% runtime |
| **CLAD / All of Us HIN pilot** (Hong 2025, OHDSI) | fhir→omop (TEFCA exchange) | csv-lookup (dynamic 49,493-row code_map) | 10.5M FHIR rows; **unmapped: Encounter 45.8%, Procedure 51.6%, Device 93.5%** (Epic-local codes), MedicationRequest 4.1% |
| **Smile CDR / MUSC** (Lenert 2021 JAMIA) | fhir→omop | hardcoded (Java rules) + fhir-conceptmap | 1.07M patients, 137M labs; DQD 3092/3312 (93%) |
| **TermX** (Ardel 2026, Frontiers Med) | bidirectional | terminology-server + fhir-conceptmap | 74% column coverage fhir→omop, 23% reverse; TRL 3 |
| **Ward 2024 PLOS ONE** (AU primary care) | x→omop | Usagi + manual dual-mapper | 97% of medications by mapping only terms with >200 occurrences; ~90% inter-mapper agreement |
| **UK Biobank / The Hyve Delphyne** | x→omop | stcm + custom-2b in repo `resources/` | ~500k participants |

### Tooling: what artifact carries the mapping

| Tool | Artifact | Lives in |
|---|---|---|
| Usagi | STCM-shaped CSV (Approved rows only) | ETL repo → `source_to_concept_map` |
| Perseus | ETL config + Usagi-style lookups (STCM semantics) | Perseus service DB (format undocumented) |
| Delphyne (The Hyve) | STCM CSVs + custom-vocab (2B) TSVs | ETL repo `resources/` |
| White Rabbit / Rabbit-in-a-Hat | Word/MD spec + SQL skeleton — documentation only | ETL repo |
| DataQualityDashboard | ~4,000 checks; mapping police = `standardConceptRecordCompleteness`, `sourceConceptRecordCompleteness`, `isStandardValidConcept`, `fkDomain` | R package |
| Vocabulary community contribution | stage-table templates → `concept`/`concept_relationship` rows in the next Athena release (≥2 months lead) | Athena itself |

## 4. Terminology servers: infrastructure real, adoption aspirational

- **Echidna (Evidentli)** operates `fhir.ohdsi.org` / `fhir-terminology.ohdsi.org`
  (vendor claims: 10M+ concepts, 127 vocabularies; "recognized by HL7 and OHDSI"
  is vendor wording, no formal endorsement artifact found).
- **tx.fhir.org** loaded OMOP concepts but not the relationship graph — the OHDSI
  forum flagged that this breaks `$translate`/`$closure` (Gabriel, 2023).
- **Ontoserver** dominates national terminology infra (AU NCTS, German MII), yet
  **no production OMOP ETL resolves concepts through it** — even German MII,
  which runs a central Ontoserver, ships local vocab tables in its OMOP ETL.
- Bottom line (verified): **as of mid-2026 no independent production ETL publicly
  documents runtime concept resolution through a terminology server.** The IG's
  own authors (JHU, OHDSI 2025) are the closest adopter. Revealed preference:
  offline, JOIN-fast local tables.

## 5. Governance state (OHDSI, 2024–2026)

- **Themis custom-concepts convention** (published as
  `CommonDataModel/customConcepts.html`): 2B ids, in a **new site-specific
  vocabulary**, never injected into existing hierarchies, always non-standard,
  and — notably — *"Custom concepts can only be used in the `_source_concept_id`
  fields"* and *"cannot be used for network research."* (NACHC putting 2B ids in
  target `*_concept_id` violates this.)
- **STCM → 2B migration**: HSIG OKR (Carlson thread); reference methodology
  promised (Korchmar) but undelivered as of Sep 2025; only near-consensus rule:
  preserve 2B ids across refreshes (Philofsky). STCM itself: still in CDM v5.4,
  "recommended for use in ETL", centrally unpopulated.
- **2B id registry across institutions**: proposed, rejected by C. Reich as
  premature ("Very good idea, but the answer is no").
- **Themis #123** (ratified): `value_as_number` and `value_as_concept_id` not
  mutually exclusive; unmappable categorical → 0, truly absent → NULL.
  **Themis #208** (open): ETL-time unit conversion to preferred units.

## 6. Anti-pattern catalog (all cited, all verified)

1. Copy target concept into `*_source_concept_id` — NACHC, GT-FHIR2, demo repos.
2. Silent drops of unmapped codes via INNER JOIN — ETL-Synthea, OHDSI/MIMIC.
3. Code-only lookup without vocabulary key (`LIKE :code`) — GT-FHIR.
4. Matching on display text instead of codes — FhirToCdm race/ethnicity.
5. Target-vocabulary pinning in stage-2 SQL (filter by domain instead) — ETL-Synthea.
6. Raw code strings renamed into `*_concept_id` columns — HealthcareLakeETL.
7. Value-through-custom-vocab domain routing without clinical review —
   OHDSI/MIMIC chartevents → 12,608 condition rows incl. 6,531 × "sinus rhythm"
   (filed as OHDSI/MIMIC#67).
8. Crashing on unknown code systems instead of degrading — FhirToCdm.
9. FHIR system URLs as `vocabulary_id` — breaks on column length (CareEvolution's
   stated reason for rejecting STCM).

## 7. Implications for fhir2omop

Our design (ConceptMap-as-data → flat `cm.*` → set-based `_resolve_*` walk +
domain routing) sits where the survey says production converged. Validated
choices: honest `source_concept_id` 0; LEFT JOIN + COALESCE(...,0); domain
routing via materialized `std_domain`; system-URL bridge table (independently
reinvented by Microsoft Fabric).

Gaps to adopt, with named donors:

1. **Emit-0 instead of drop** for unmappable codes (doctrine: CDM FAQ, IG;
   donor: German MII's log line "Set concept id to 0"). Our discrepancy #6.
2. **Mapping validity windows** (donor: German MII matviews carrying dual
   source+mapping validity columns).
3. **Deterministic multi-coding tie-break** — cite the IG's Code Prioritization
   Framework for our `prio`-ordered `DISTINCT ON` CTEs.
4. **`'Maps to value'` slot** (IG ValueAsConceptPattern dual-relationship walk).
5. **2B projection as a hedge, not a base**: keep `cm.*` as source of truth;
   if ATLAS visibility is ever needed, project ConceptMaps into a separate
   overlay vocabulary per the Themis convention (own vocabulary_id, source
   fields only, deterministic ids committed in the ConceptMap).
6. **Never use FHIR system URLs as vocabulary ids** in any STCM-compatible
   export (CareEvolution's column-length lesson).
7. **Counted, logged residue** on every resolve filter — no silent truncation.

## 8. Key sources

- HL7 FHIR→OMOP IG v1.0.0 (Informative, 2026-04): https://hl7.org/fhir/uv/omop
  (terminology server prescription, 2-billionaires, code prioritization,
  unmapped=0; note `/en/` paths for content pages)
- Themis custom concepts: https://ohdsi.github.io/CommonDataModel/customConcepts.html
- STCM→2B thread: https://forums.ohdsi.org/t/methodology-for-converting-source-to-concept-map-to-concept-concept-relationship-2-billionaires/21190
- concept_id=0 thread: https://forums.ohdsi.org/t/concept-id-0/24215
- OMOP vocab on FHIR gap: https://forums.ohdsi.org/t/omop-vocabulary-available-on-fhir-but-more-insight-is-needed/19677
- German MII ETL: https://github.com/OHDSI/ETL-German-FHIR-Core ;
  Peng 2022: https://pubmed.ncbi.nlm.nih.gov/36395615/
- MENDS-on-FHIR: https://pmc.ncbi.nlm.nih.gov/articles/PMC11137321/
- CLAD/All of Us HIN pilot (Hong 2025): https://www.ohdsi.org/wp-content/uploads/2025/10/601-Hong-Brief_Report_Bridging-Standards_-Creating-OMOP-data-via-FHIR-and-Health-Information-Networks-Lightning-Talk-Brief-Report_updated0930-Stephanie-S-Hong.pdf
- CareEvolution Rosetta (Berk 2025): https://www.ohdsi.org/wp-content/uploads/2025/10/110_berk_benjamin_fhir-omop-data-lineage_2025symposium_REPORT-Benjamin-Berk.pdf
- Microsoft Fabric OMOP vocabularies: https://learn.microsoft.com/en-us/industry/healthcare/healthcare-data-solutions/omop-transformations-vocabularies
- Ward 2024 (AU primary care): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0301557
- TermX (Ardel 2026): https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2026.1736785/full
- Usagi: http://ohdsi.github.io/Usagi/usage.html ; Perseus: https://github.com/OHDSI/Perseus ;
  Delphyne: https://github.com/thehyve/delphyne ; DQD: https://ohdsi.github.io/DataQualityDashboard/
- Vocabulary contribution: https://github.com/OHDSI/Vocabulary-v5.0/wiki/Community-contribution
- Echidna: https://echidna.fhir.org/ ; https://fhir.ohdsi.org/
- Smile CDR/MUSC (Lenert 2021): https://academic.oup.com/jamia/article/28/10/2241/6335664
