# Loading the CVX (vaccine) vocabulary

`Immunization.vaccineCode` is CVX-coded, and CVX is the preferred OMOP Drug
vocabulary for vaccines (see `mapspec/etl/Immunization__drug_exposure.sql`).
Getting a real `drug_concept_id` for a vaccine therefore depends on CVX being
present in `vocab.concept` **with a `Maps to` relationship to a Standard
concept** (many CVX concepts are themselves Standard and map to themselves).

## Load it — one command

```sh
bun script/load-cvx.ts            # downloads the CVX-inclusive bundle, splices CVX into vocab.*
```

`script/load-cvx.ts` is surgical and non-destructive: it does **not** reload the
whole vocabulary. It pulls only the CVX concepts + their `Maps to` rows (and any
missing crosswalk targets) out of a CVX-inclusive Athena bundle and replaces any
existing CVX rows in `vocab.*`, in one transaction. Idempotent — re-run any time.

Sources, in priority order:

```sh
bun script/load-cvx.ts                       # default: download from the public magic URL below
bun script/load-cvx.ts path/to/bundle.zip    # a local Athena bundle zip
bun script/load-cvx.ts path/to/bundle-dir/   # an unzipped bundle dir
CVX_BUNDLE_URL=https://… bun script/load-cvx.ts   # override the download URL
```

Verify:

```sh
PGPASSWORD=athena psql -h localhost -p 54392 -U athena -d athena -tAc \
  "SELECT count(*) FILTER (WHERE standard_concept='S') std, count(*) total
   FROM vocab.concept WHERE vocabulary_id='CVX';"
# CVX 140 → Standard 40213154:
PGPASSWORD=athena psql -h localhost -p 54392 -U athena -d athena -c \
  "SELECT concept_id, concept_name, standard_concept FROM vocab.concept
   WHERE vocabulary_id='CVX' AND concept_code='140';"
```

Then re-run the gate + the connectathon comparison:

```sh
bun script/run-cases.ts
# immunization_p2_influenza_cvx should resolve drug_concept_id 40213154 (not 0)
```

## Why this is needed (the trap it avoids)

Our default Athena bundle (`athena-bundle-20260511-v20260227.zip`) was generated
**without CVX** — `CONCEPT.csv` contains **0 CVX rows** (verify:
`grep -c -P '\tCVX\t' athena/bundle/CONCEPT.csv`). CVX is public-domain (CDC) and
free on Athena, but it is a per-bundle checkbox and simply wasn't selected.

An earlier stop-gap backfilled the raw CDC code list as placeholder concepts in
the OMOP-Extension reserve range (`2_000_000_000+`), all non-Standard, with **no
`Maps to`**. That made every vaccine resolve to `drug_concept_id = 0` — coverage
of the codes, but zero analytic value, and a divergence from the F2O
Connectathon gold (which resolves CVX 140 → Standard `40213154`). That backfill
has been removed; `script/load-cvx.ts` now loads the real vocabulary instead.

## The bundle behind the magic URL

`script/load-cvx.ts` defaults to a public capability URL (an unguessable
sha256-hashed path) for a CVX-inclusive Athena bundle:

```
https://storage.googleapis.com/atomic-ehr-athena-public/240cac7c2e8d7a578ed64661372caa37b85dd2b6fd601522e271886e95a32fe2/athena-bundle-20260707-v20260227-cvx.zip
```

- Bundle: `athena-bundle-20260707-v20260227` (vocab v20260227, same as the main
  bundle, **plus CVX**). Also archived privately at
  `gs://atomic-ehr-athena-vocab/bundles/athena-bundle-20260707-v20260227.zip`.
- The public bucket `atomic-ehr-athena-public` holds **only** this bundle.

## Regenerating a CVX-inclusive bundle from Athena (reference)

If you need a fresh bundle (new vocab version), regenerate it with CVX ticked:

1. Log in to <https://athena.ohdsi.org/vocabulary/list>.
2. Select the vocabularies this project uses **plus `CVX`** (SNOMED, ICD9CM,
   ICD9Proc, CPT4, HCPCS, LOINC, RxNorm, RxNorm Extension, NDC, ATC, ICD10CM,
   OMOP Extension, the OMOP standard/metadata vocabs, **CVX**). UCUM and the CDM
   metadata vocabularies are always auto-included.
3. Download the emailed ZIP.
4. `bun script/load-cvx.ts path/to/that.zip` to splice its CVX in — no full
   reload needed. (Or `bun script/init-athena.ts <gs://…zip>` for a clean full
   refresh, which also refreshes every other vocabulary.)
