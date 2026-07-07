# F2O Connectathon 2026 suite — vendored external oracle

The HL7 FHIR-to-OMOP Connectathon 2026 "stingy" sample fixture pack (Workflow-1
reference set), vendored verbatim so we can run **their** conformance suite
against our pipeline with one command.

- Source: `2026 F2O Connectathon Participant Artifacts / FHIR Sample Data /
  01 Sample FHIR data - stingy set` (F2O WG participant artifacts).
- Baseline: FHIR R4 (base, unprofiled) → OMOP CDM v5.4; OHDSI vocab v20260227
  (needs CVX — see `docs/cvx-vocabulary.md`).
- `expected_results.json` is the answer key; `README.md` is the pack's own doc.

## Run their suite

```sh
bun script/run-connectathon.ts                 # → per-fixture pass/fail + total
bun script/run-connectathon.ts <other-dir>     # point at a different bundle
```

`script/run-connectathon.ts` loads every fixture through the real FHIR→OMOP
pipeline (isolated schemas, full Athena vocab), matches each positive fixture's
expected concept_ids, and re-runs each **negative** fixture in isolation to
assert it is excluded (0 rows). Current result: **23 / 23**.

## Relationship to `cases/`

This is a **second opinion** — an independent external oracle. Our own gate is
`cases/*.json` run by `bun script/run-cases.ts` (exact, branch-by-branch,
hermetic — no full Athena needed). Every behaviour this pack exercises is also
mirrored there as a golden case, so the repo gate stays self-contained even
without this suite; this runner just makes "do we still pass the WG suite?" a
one-liner.
