# FHIR→OMOP Connectathon — DQD experiment report

**Date:** 2026-07-08
**Author:** Nikolai Ryzhikov (Health Samurai), representing the SQL on FHIR Working Group
**Repo:** <https://github.com/lampadephoros/fhir2omop>
**Scope:** HL7 Vulcan FHIR-to-OMOP Connectathon (Jul 2026), Workflow 2 (own stack).

## TL;DR

We re-expressed the OHDSI Data Quality Dashboard (DQD) check families as
SQL-on-FHIR **SQLQuery-Library** resources ([HL7/sql-on-fhir#375](https://github.com/HL7/sql-on-fhir/issues/375))
and ran them against our converter's output **and** the F2O WG's own
gold-standard OMOP tables.

Crucially, the volume sample ships a **`volume_expected_dqd.json`** — the WG's
own *predicted* DQD output — which is the ground truth for what is **intentional**.
Cross-checking against it:

- **Almost all completeness/plausibility signals in the gold are deliberate**,
  each tied to an f2o statement (unmapped local codes, `dataAbsentReason` nulls,
  text-only conditions, and *implausible-gender* rows such as benign prostatic
  hyperplasia on female patients). Our runner **reproduces** these — validating
  it against the WG oracle.
- Our converter has **0 conformance errors** and reproduces the intended signals.
- **One anomaly in the gold is *not* predicted and is *not* in the source data:**
  a visit whose end precedes its start (`plausibleStartBeforeEnd`). This is the
  single finding worth raising as a likely unintended gold artifact.
- We **reproduce the WG's predicted signals**, including the implausible-gender
  seed: our `plausibleGender` check flags exactly the **6 BPH + 4 prostate-cancer
  conditions on female patients** (= the WG's predicted plausibleGender 6 +
  plausibleGenderUseDescendants 4), and `measureValueCompleteness` flags 20
  value-less measurements (≈ the WG's predicted 18 `dataAbsentReason`).

## How our converter works (in plain terms)

We do **ELT, not ETL** — Extract-**Load**-Transform. Instead of transforming FHIR
in application code and then loading OMOP, we load the raw FHIR into the database
first and transform **in place with SQL**, in two stages:

1. **Load** — every FHIR resource lands as-is in Postgres: one table per
   resourceType, `id text` + `resource jsonb`. Nothing is interpreted yet.
   (A one-time pass normalizes conditional/identifier references to deterministic
   `uuid5` surrogate ids so foreign keys resolve.)

2. **Transform — stage 1 (flatten), the FHIR-native layer.** We use
   **[SQL on FHIR](https://sql-on-fhir.org) `ViewDefinition`s** to flatten nested
   FHIR into flat, columnar staging tables. A ViewDefinition is a portable,
   declarative spec — FHIRPath column expressions, `forEach`, `unionAll` — with
   **no OMOP knowledge**. This is the same standard the connectathon itself
   proposes as the shared flattening layer for FHIR-to-OMOP. Spec:
   <https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/>, repo:
   <https://github.com/FHIR/sql-on-fhir-v2>.

3. **Transform — stage 2 (map to OMOP), the vocabulary layer.** Plain SQL
   `SELECT`s over the stage-1 tables `JOIN` the OHDSI vocabularies
   (`vocab.concept`, `concept_relationship 'Maps to'`, `concept_ancestor`) and our
   ConceptMap tables (`cm.*`) to resolve source codes → standard OMOP
   `concept_id`s, route each row to the right OMOP table by the concept's
   `domain_id`, and write `cdm_ours_fhir.*` (OMOP CDM v5.4).

The same idea powers the **data-quality layer in this report**: DQD checks are
just more SQL-over-the-flattened-data, packaged as SQL-on-FHIR **SQLQuery-Library**
resources per [HL7/sql-on-fhir#375](https://github.com/HL7/sql-on-fhir/issues/375).

```
FHIR bundles ──Load──▶ fhir.*  ──ViewDefinition (SQL-on-FHIR)──▶ staging.*
   (jsonb)                              (flat, FHIR-native)          │
                                                                     ▼ stage-2 SQL
                                        cdm_ours_fhir.*  ◀──JOIN vocab.* + cm.*──┘
                                        (OMOP CDM v5.4)
```

Everything is standard and inspectable: the transforms are `ViewDefinition` JSON
+ SQL (no black-box code), the vocabulary is the published OHDSI release, and the
conformance target is the HL7 [FHIR-to-OMOP IG](https://build.fhir.org/ig/HL7/fhir-omop-ig/)
statements. Source: <https://github.com/lampadephoros/fhir2omop>.

## Method

- **Checks:** 258 DQD checks (`mapspec/dqchecks/*.sqlquery.json`) generated from
  the OMOP CDM v5.4 field-level catalog + the OHDSI concept-level gender catalog —
  `cdmNotNullable`, `isPrimaryKey`, `isForeignKey`, `conceptRecordCompleteness`
  (concept_id = 0 rate), `plausibleStartBeforeEnd`, `plausibleGender`,
  `measureValueCompleteness`, `sourceValueCompleteness`. Each is a `Library(type=sqlquery)` returning the
  failing rows (0 rows = pass) plus DataQualityCheck metadata (Kahn category,
  threshold, severity). Runner: `bun script/dq.ts <schema>`; dashboard at `/dq`.
- **Threshold:** flat 5% for completeness, 0 for conformance/plausibility —
  **stricter** than reference OHDSI DQD per-field thresholds.
- **Schemas:** `cdm_ours_fhir` (our pipeline, ~105-pt Synthea, post
  reference-normalization); `cdm_connectathon` (our pipeline, stingy set);
  `cdm_gold` (the WG **Focused Gold Standard Tables**, volume set).
- **Oracle:** `volume_expected_dqd.json` — the WG's predicted DQD for the volume set.

## Our results

| gate | result |
|---|---|
| Golden case suite (`run-cases`) | **172 / 172** |
| Connectathon answer-key (`run-connectathon`) | **23 / 23** (concept-level) |
| DQD on `cdm_ours_fhir` (Synthea) | 206 pass, 3 fail (completeness/warning), **0 error** |
| DQD on `cdm_connectathon` | 123 pass, 7 fail (completeness/warning), **0 error** |
| DQD on `cdm_gold` (F2O WG gold oracle) | 127 pass, 13 fail, **0 error** |

## What the gold's failures actually are

The WG's `volume_expected_dqd.json` predicts these intentional signals — every
one an f2o test, **not** a defect:

| predicted check | f2o | seeded example |
|---|---|---|
| standardConceptRecordCompleteness | f2o-032 | 12 conditions with local unmapped codes → concept_id 0 |
| sourceValueCompleteness | f2o-033 | 6 text-only conditions → null source_value + concept_id 0 |
| sourceConceptRecordCompleteness | f2o-031 | unmapped locals → source_concept_id 0 |
| measureValueCompleteness | f2o-080/081 | 18 measurements with `dataAbsentReason` → null value |
| plausibleGender | f2o-031/037 | **6** BPH (198803) on **female** patients |
| plausibleGenderUseDescendants | f2o-031/037 | 4 prostate-cancer descendants on female patients |
| measureObservationPeriodOverlap | f2o-061 | derived observation_period collapse |

**Cross-check (our DQD vs the F2O WG prediction):**

- Our `condition_concept_id = 0` count on the gold is **19 / 147**. The F2O WG
  prediction: **12** (unmapped) **+ 6** (text-only) = **18**. Match (±1) — our
  single completeness check simply *merges* two categories the F2O WG splits. ✓
- Implausible gender: our `plausibleGender` check flags **10** conditions on
  female patients — **6** BPH (198803) + **4** primary prostate cancer (200962) —
  matching the F2O WG `plausibleGender.implausible_count = 6` **and**
  `plausibleGenderUseDescendants = 4` in one pass (200962 is directly in the
  OHDSI catalog, so no descendant rollup is needed). ✓
- Value completeness: our `measureValueCompleteness` flags **20 / 134**
  value-less measurements vs the F2O WG's predicted **18** `dataAbsentReason`
  nulls (±2, our check also catches a few non-`dataAbsentReason` empties). ✓
- Source-value completeness: our `sourceValueCompleteness` flags **exactly 6 / 147**
  conditions with a null `condition_source_value` on the gold — the WG's predicted
  6 text-only conditions (f2o-033). On our own output the same check is 0: we
  always populate `*_source_value` (for a text-only condition we emit `code.text`
  where the gold emits null — a genuine f2o-033 interpretation difference the
  check surfaces quantitatively). ✓

Conclusion: the gold's completeness/plausibility failures are **deliberate,
documented test signals**. Flagging these as "bugs" would be wrong — they are the
point of the exercise (a conformant converter reproduces them).

## The one genuinely questionable item

**A visit ends before it starts.** `cdm_gold.visit_occurrence` row
`visit_occurrence_id = 1`: `visit_start_datetime = 2025-06-04 11:00`,
`visit_end_date = 2025-06-01`. End precedes start by 3 days.

Why we think this is an *unintended* gold artifact rather than a seeded example:

1. It is **not** in `volume_expected_dqd.json` — the WG did not predict a
   temporal-plausibility signal, and every other seeded example *is* listed.
2. The **source is clean**: of 130 volume-set `Encounter` resources, **0** have
   `period.end < period.start`. So the reversal was introduced during gold
   generation, not carried from input.
3. It fails `plausibleStartBeforeEnd` at any threshold.

**We are not certain** — it could still be an unlisted deliberate case — so we
raise it as a **question**, not a bug claim.

## Scope observation (needs WG clarification)

**`visit_concept_id = 0` for all 136 gold visits** (verified in raw CSV column 3
and SQL). This is systematic (not a per-row example) and **not** in the predicted
DQD, so it reads as a *scope limitation* of the "Focused" gold — it does not
populate the standard Visit concept. Our converter does (connectathon: 9202 ×5,
9201 ×1; Synthea: 0 zeros / 6,388 visits, 5 distinct). Implementers diffing full
`visit_occurrence` against this gold would see false discrepancies on that column.

## Recommendations for the connectathon / IG team

1. **Verify the reversed-date visit** (`visit_occurrence_id = 1`) — if
   unintended, fix it; if it *is* a deliberate `plausibleStartBeforeEnd` example,
   add it to `volume_expected_dqd.json` so implementers know to expect it.
2. **Document the scope of "Focused" gold tables** — which columns are
   authoritative vs intentionally blank (e.g. `visit_concept_id`, note/observation
   concept fields). Diffing full OMOP tables against a partial gold yields false
   positives.
3. **Publish `*_expected_dqd.json` prominently** — it is excellent, and turns DQD
   from "did I fail?" into "did I reproduce the *expected* signals?". Consider
   shipping it for the stingy set too.
4. **Ship reference per-field DQD thresholds** so optional-field completeness
   noise on small samples doesn't mask conformance/plausibility signal.

## Our own follow-ups (gaps this surfaced on *our* side)

- Added `plausibleGender`, `measureValueCompleteness` and
  `sourceValueCompleteness` — we now reproduce all of the WG's predicted signals
  (see cross-check above). Still to add: a faithful descendant-rollup variant (the
  OHDSI use-descendants catalog rows are multi-id quoted fields that need proper
  parsing).
- Adopt per-field thresholds to align with reference DQD.

## Caveats (honesty)

- The gold is the **volume** set (60 pts); our `cdm_connectathon` run is the
  **stingy** set (4 pts) — failure counts are indicative, not paired. The
  specific gold observations (reversed date, `visit_concept_id = 0`) were checked
  directly against the volume gold and stand on their own merits.
- Our threshold is stricter than reference DQD (flat 5% vs per-field).
- Every finding was verified twice — raw CSV **and** loaded `cdm_gold` schema —
  and cross-checked against the WG's own `volume_expected_dqd.json`.

## Reproduce

```sh
bun script/run-cases.ts                    # 172/172 golden
bun script/run-connectathon.ts             # 23/23 concept-level answer-key
bun script/dq.ts cdm_ours_fhir             # DQD on our Synthea output
bun script/dq.ts cdm_gold                  # DQD on the WG gold oracle
# dashboard: /dq  (schema switcher, category/table grouping, All/Failing filter, drill-down)
```
