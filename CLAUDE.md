---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# FHIR to OMOP Mapping Project

This project maps FHIR R4 resources to OMOP CDM (Common Data Model) for observational health data research.

## Writing convention

**All committed prose is English-only** — code comments, edge.json
`notes` / `description`, view/profile `description`, CLAUDE.md, README,
commit messages. Chat with the user can be bilingual; anything that
lands in the repo stays in English so non-Russian-speaking contributors
can read it.

## OMOP `*_source_value` semantics (project-wide)

`*_source_value` columns in OMOP are **traceability anchors back to the
source record, not clinical identifiers**. Per OMOP CDM v5.4 spec
(`person_source_value` user_guidance):

> Use this field to link back to persons in the source data. This is
> typically used for error checking of ETL logic.

Concrete rule for this codebase:

- `person.person_source_value` ← `Patient.id` (FHIR resource UUID).
  **Never** SSN, MR, DL, or other PHI identifiers from
  `Patient.identifier[]`. Those are PII and don't belong in OMOP;
  if a downstream consumer needs them, that's a separate id-mapping
  table per OHDSI privacy guidance — not this column.
- Same pattern for `provider.provider_source_value`,
  `care_site.care_site_source_value`,
  `visit_occurrence.visit_source_value`, etc. — the FHIR resource id
  is the right value; other identifiers belong elsewhere.

When an edge.json `notes` field says "best: SSN > MR > first" or
similar, that's a spec bug — fix the spec, don't implement the
priority. (See `mapspec/edges/Patient__person.json` →
`fields[person_source_value].notes` for the reference wording.)

## OMOP `*_source_concept_id` semantics — zero is fine

The companion `*_source_concept_id` column is meant to hold the
Athena concept_id of the source code in its **native vocabulary**, so
that analysts can trace which source vocab a value came from. Crucially,
OMOP CDM v5.4 explicitly tells you it's commonly zero:

> `race_source_concept_id` user_guidance: "Due to the small number of
> options, this tends to be zero. If the source data codes race in an
> OMOP supported vocabulary store the concept_id here."
>
> `ethnicity_source_concept_id` user_guidance: "Due to the small number
> of options, this tends to be zero."

Concrete rule for this codebase:

- Don't try to "improve coverage" by copying the standard target
  `concept_id` into `*_source_concept_id` (e.g. setting
  `race_source_concept_id = race_concept_id`). The semantics differ
  (source vocab vs. target vocab); doing so is observed in some
  reference implementations but breaks downstream analytics that read
  the source concept to recover the original vocabulary.
- Concrete example: US Core / OMB race codes (`2106-3`, `2054-5`, …)
  are **not** loaded as `concept_code` under any race vocabulary in
  Athena — OMOP's Race vocab uses integer codes 1-5/9/UNK. So the
  honest mapping for an OMB-coded source is `0`, and that's what we
  ship. (See `mapspec/edges/Patient__person.json` →
  `fields[race_source_concept_id].notes` for the long-form rationale.)
- The race **standard concept** (8527 White, 8516 Black, …) goes in
  `race_concept_id`. The raw OMB code (`2106-3`) goes in
  `race_source_value`. `race_source_concept_id` stays 0.

If a future Athena bundle does load OMB Race / Ethnicity as a
non-standard vocabulary with the OMB codes as `concept_code`, then
materializing `cm.race_omb_to_omop` with the `omop-source-vocabulary`
extension (see `src/conceptmap/materialize.ts`) will start populating
this column automatically — no edge.json change needed.

## Bootstrap from zero

```sh
# 1. Clone with all submodules (CommonDataModel + ~38 reference implementations under refs/refs/)
git clone --recurse-submodules https://github.com/HealthSamurai/fhir2omop
cd fhir2omop
# Already cloned without --recurse-submodules? Run:
git submodule update --init --recursive

# 2. Install dependencies (uses Bun, not npm)
bun install

# 3. Download FHIR R4 core metadata (~3.7 MB gzipped, 4,574 resources)
#    Writes both fhir-core/ (full) and data/ (slim {url, resourceType, version, id})
bun src/load-fhir-core.ts

# 4. Sanity checks
ls mapspec/edges/    | wc -l    # 33 FHIR→OMOP edge maps (29 implemented + 4 stub)
ls mapspec/profiles/ | wc -l    # 28 profiles + 10 valuesets + 10 ConceptMaps (.cm.json) + 2 extension SDs + system-aliases.json
ls mapspec/views/    | wc -l    # 26 ViewDefinitions (Stage-1 flatteners)
ls mapspec/etl/*.sql | wc -l    # 33 stage-2 SQL + 4 _resolve_*.sql + _functions.sql

# 5. Bring up Postgres + load Athena vocabularies (~6.4M concepts, ~75M ancestor rows)
docker compose up -d                                      # Postgres 17 (ParadeDB) on :54392
bun script/init-athena.ts                                 # Pulls bundle ZIP from GCS, loads vocab.*

# 6. Correctness gate — golden FHIR→OMOP test cases (see cases/README.md).
#    Self-contained: runs hermetically against a committed vocab subset (no full
#    Athena bundle needed). This is the gate; it needs no source FHIR dataset.
bun script/run-cases.ts                                    # run cases/*.json against the real pipeline

# 7. (Optional) Run the transform end-to-end on a FHIR cohort.
#    Source-agnostic — point load-fhir.ts at ANY directory of FHIR R4 bundles
#    (an EHR FHIR dump, a Synthea export, hand-authored fixtures).
PGPASSWORD=athena psql -h localhost -p 54392 -U athena -d athena -v ON_ERROR_STOP=1 \
  -f mapspec/etl/_functions.sql                            # referenceToId()/stringToId() helpers
bun script/load-fhir.ts path/to/fhir-bundles/             # → fhir.* (raw jsonb staging)
bun script/etl-all.ts                                      # cm.* → staging.* → cdm_ours_fhir.* (full pipeline)

# 8. Start the UI/dev server (writes its port to .hyper/_runtime/port, default 3000)
bun src/\$main.ts                                          # http://localhost:3000
# In a second terminal you can hot-reload via the REPL — see "REPL workflow" below
#   bun script/repl.ts 'console.log(Object.keys(ctx.fns))'
```

What gets pulled by submodules:
- `CommonDataModel/` — OHDSI source-of-truth: `inst/csv/OMOP_CDMv5.4_*.csv`, DDL for 15 SQL dialects
- `refs/refs/*` — 38 reference implementations (HL7 IG, FhirToCdm, NACHC, omoponfhir, etc.). Pre-analyzed summaries live alongside in `refs/*.md`.

What gets generated locally and is gitignored:
- `fhir-core/` and `data/` — produced by `bun src/load-fhir-core.ts`
- `node_modules/` — produced by `bun install`

## Project Resources

### Documentation
- `sources.md` - OMOP/OHDSI information sources (official docs, tools, community)
- `cdm.md` - Index of OMOP CDM tables, fields, and repository structure

### PostgreSQL — Athena vocabularies

Local Postgres holds the OMOP standardized vocabularies (Athena bundle: SNOMED,
ICD9/10CM, CPT4, HCPCS, LOINC, RxNorm, NDC, ATC, …). Used for code lookups,
hierarchy walks (`concept_ancestor`), and `source_to_concept_map` joins during
FHIR→OMOP ETL.

```
docker-compose.yml               # paradedb/paradedb:latest-pg17 on host port 54392
script/athena-schema.sql         # DDL for the 9 vocab.* tables
script/load-athena.ts            # CSV bundle → vocab.* loader (psql \copy + staging)
script/init-athena.ts            # gcloud cp from GCS + unzip + load (one-shot bootstrap)
athena/downloads/                # ZIP cache (gitignored)
athena/bundle/                   # Extracted CSVs (gitignored)
```

**Connection**
- DSN: `postgresql://athena:athena@localhost:54392/athena`
- Override via `ATHENA_DSN` env var.
- Connect: `PGPASSWORD=athena psql -h localhost -p 54392 -U athena -d athena`

**Bundle source (GCS)**
- Project: `atomic-ehr`
- Bucket: `gs://atomic-ehr-athena-vocab/bundles/`
- Current: `athena-bundle-20260511-v20260227.zip` (928 MB, v20260227 vocabularies)
- Fresh bundles come from https://athena.ohdsi.org/vocabulary/download-history
  — log in, pick vocabs, wait for the email, download, then upload with
  `gcloud storage cp <zip> gs://atomic-ehr-athena-vocab/bundles/`.

**Schemas**
- `vocab.*` — typed target tables (the standard OMOP CDM v5.4 vocabulary schema)
- `vocab_staging.*` — text-column staging tables; created per file by the
  loader and dropped on success (date columns arrive as `YYYYMMDD` strings and
  get converted via `to_date(..., 'YYYYMMDD')`).

**Tables in `vocab` schema** (row counts from the May 2026 bundle):

| Table | Rows | Purpose |
|---|---:|---|
| `vocab.vocabulary` | 59 | Vocabulary registry (id, name, version, reference) |
| `vocab.domain` | 50 | Domain dictionary (Condition, Drug, Measurement, …) |
| `vocab.concept_class` | 433 | Concept class dictionary (Clinical Finding, Ingredient, …) |
| `vocab.relationship` | 722 | Relationship type registry + reverses |
| `vocab.concept` | 6,396,107 | All standardized + source concepts, one row per `concept_id` |
| `vocab.concept_synonym` | 2,700,416 | Alternative names per concept |
| `vocab.concept_relationship` | 39,381,422 | Pairwise relationships (Maps to, Is a, RxNorm has ing, …) |
| `vocab.concept_ancestor` | 75,530,956 | Pre-computed transitive closure of hierarchical "Is a" relationships |
| `vocab.drug_strength` | 2,966,827 | Drug ingredient strengths (amount, numerator/denominator + units) |

**Common queries**

```sql
-- Look up a SNOMED code
SELECT concept_id, concept_name, standard_concept, domain_id
FROM vocab.concept
WHERE vocabulary_id = 'SNOMED' AND concept_code = '44054006';

-- ICD10CM → SNOMED via "Maps to"
SELECT c2.concept_id, c2.concept_name
FROM vocab.concept c1
JOIN vocab.concept_relationship cr
  ON cr.concept_id_1 = c1.concept_id AND cr.relationship_id = 'Maps to'
  AND cr.invalid_reason IS NULL
JOIN vocab.concept c2 ON c2.concept_id = cr.concept_id_2
WHERE c1.vocabulary_id = 'ICD10CM' AND c1.concept_code = 'E11.9';

-- All descendants of "Diabetes mellitus" (SNOMED 73211009 → concept_id 201820)
SELECT descendant_concept_id, c.concept_name
FROM vocab.concept_ancestor a
JOIN vocab.concept c ON c.concept_id = a.descendant_concept_id
WHERE a.ancestor_concept_id = 201820;
```

**Re-loading**
Re-running `bun script/load-athena.ts <dir>` is destructive — it drops and
recreates the `vocab.*` tables (see top of `script/athena-schema.sql`). Pull a
newer ZIP from GCS, point `bun script/init-athena.ts gs://…/newer.zip` at it.

**CPT4 post-processing (optional)**
The bundle ships `cpt4.jar` + `CONCEPT_CPT4.csv`. CPT4 concept names are
licensed and not included in `CONCEPT.csv` — run `sh cpt.sh` inside
`athena/bundle/` with a UMLS API key to hydrate them in place before loading,
if you need them.

### Source FHIR input (bring your own)

The transform is **source-agnostic**. Point `bun script/load-fhir.ts <dir>` at
**any** directory of FHIR R4 Bundle `.json` files — a real EHR FHIR export,
hand-authored fixtures, or a Synthea export — and it streams them into `fhir.*`.
Nothing downstream (`etl-all.ts`, the stage-1 views, the stage-2 SQL) cares where
the FHIR came from. There is **no bundled dataset and no generator in this repo**.

> **Correctness lives in `cases/`, not in a cohort.** The golden test cases
> (`cases/*.json`, run by `script/run-cases.ts`) are the gate — exact,
> branch-by-branch, and **hermetic** (a committed vocab subset, no source dataset
> and no full Athena bundle needed). New coverage is hand-authored there; see
> `cases/README.md`. A full-cohort run (load-fhir → etl-all) is an **optional**
> way to exercise the runtime on realistic volume / populate the sample-row UI —
> not the correctness mechanism.
>
> History: this project was originally bootstrapped against a Synthea cohort
> (`-s 1779010226473 -p 100`, ~105 patients, US Core IG on). Every branch that
> cohort exercised was extracted into `cases/` and Synthea was then retired,
> along with the earlier Synthea-CSV → `cdm.*` **reference oracle** (deleted
> `script/load-cdm*`, `src/etl_synthea/`, `src/diff/`, `src/compare/`, the `/diff`
> and `/compare` UI). Branches a cohort can't ground (the stub edges, error
> paths, vocab corners) are now added directly as synthetic cases.

Pipeline (FHIR → OMOP) + golden-case gate:

```
[any FHIR R4 bundle dir]
        │
        └──► bun script/load-fhir.ts <dir>   ──►  fhir.*
                                                   │
                                                   ▼ stage-1 (SQL-on-FHIR)
                                                staging.*
                                                   │
                                                   ▼ stage-2 SQL (JOIN cm.* + vocab.*)
                                                cdm_ours_fhir.*

  Correctness gate (self-contained): cases/*.json ──► bun script/run-cases.ts ──►
  run each case's fhir[] through the real pipeline in isolated schemas, assert the
  exact OMOP rows. No source dataset required.
```

`Patient.id` (the FHIR resource id) → `cdm_ours_fhir.person.person_source_value`;
references hash to surrogate ids via `referenceToId()` = `hashtextextended(uuid, 0)::bigint`.

### Schemas in one DB

| Schema | Source | Owner | Purpose |
|---|---|---|---|
| `vocab.*`           | Athena bundle | `bun script/init-athena.ts` | Standardized vocabularies — read-only |
| `cm.*`              | `mapspec/profiles/*.cm.json` | `ctx.fns.conceptmap.materialize` | Source-code → OMOP concept_id lookup tables (one per ConceptMap) |
| `fhir.*`            | any FHIR R4 bundle dir       | `bun script/load-fhir.ts`       | Raw FHIR resources (jsonb staging) |
| `staging.*`         | `fhir.*` + view JSONs        | `ctx.fns.viewdef.materialize`   | Stage-1 FHIR-flat materializations (one per ViewDefinition) |
| `cdm_ours_fhir.*`   | `staging.*` + `cm.*`         | `mapspec/etl/<R>__<T>.sql`      | Our FHIR→OMOP pipeline target (validated by `cases/` via `script/run-cases.ts`) |

(The `cdm.*` reference-oracle schema was retired together with `script/load-cdm*`.)

The FHIR↔OMOP join key is **always** the FHIR resource id:

```sql
-- The bridge query: link every FHIR resource back to its OMOP row.
SELECT op.person_id, fp.id, fp.resource->>'gender'
FROM fhir.patient fp
JOIN cdm_ours_fhir.person op ON op.person_source_value = fp.id;
```

### Bun.SQL gotchas

> **30 s default per-query timeout.** A long-running `TRUNCATE` or
> `COPY`/`INSERT` against a large `fhir.*` table can time out on the client
> while the backend keeps running — the connection is dropped, but the
> Postgres process holds locks and blocks everything else. Symptom: every
> subsequent query hangs in `Lock|relation` (visible in `pg_stat_activity`).
> Fix: terminate the stuck backends, then prefer `psql`/server-side ops for
> bulk work. Tracker:
>
> ```sql
> SELECT pid, pg_terminate_backend(pid), age(now(), query_start)
> FROM pg_stat_activity
> WHERE state = 'active' AND pid <> pg_backend_pid()
>   AND age(now(), query_start) > interval '1 minute';
> ```

### `fhir.*` schema (one table per resourceType)

Schema convention: `fhir.<resource_type_snake_case>(id text PRIMARY KEY,
resource jsonb NOT NULL)`. Tables are created on-demand by
`src/fhir/ensureTable.ts` (CamelCase → snake_case: `MedicationRequest` →
`medication_request`).

Load all bundles in a directory (concurrency=8 by default):

```sh
bun script/load-fhir.ts path/to/fhir-bundles/
# → fhir.patient, fhir.encounter, fhir.observation, … (one table per resourceType)
# e.g. a ~105-patient cohort = ~107 bundle files, ~112k rows in ~1.6s
```

The loader is **idempotent** — re-running re-INSERTs via
`ON CONFLICT (id) DO UPDATE`. Truncate before re-loading only if you've
changed the loader logic (see the "double-encoding gotcha" note below).

> **JSONB double-encoding gotcha.** When inserting JSON into a `jsonb`
> column from Bun.SQL, do **not** pre-`JSON.stringify` the object and pass
> it as a `$N` parameter — Bun's driver re-encodes string params, and
> Postgres stores `'"{\"a\":1}"'::jsonb` (a JSON string scalar, not the
> object). `jsonb_typeof` returns `'string'` instead of `'object'`.
>
> Two correct patterns: (a) inline JSON literals in the SQL text and let
> `::jsonb` parse them server-side (used in `src/fhir/loadBundle.ts`); or
> (b) pass `params` to `db.query` as primitives only — do extraction
> rather than insertion of complex types.

### OMOP CDM (git submodule)
```
CommonDataModel/           # https://github.com/OHDSI/CommonDataModel
├── inst/csv/              # Table & field definitions (source of truth)
│   ├── OMOP_CDMv5.4_Table_Level.csv
│   └── OMOP_CDMv5.4_Field_Level.csv
└── inst/ddl/5.4/          # DDL scripts for 15 SQL dialects
```

### FHIR↔OMOP Reference Implementations (git submodules in refs/)
```
refs/
├── fhir-omop-ig/          # HL7 Official FHIR↔OMOP Implementation Guide
├── fhir2omop-cookbook/    # CodeX HL7 FHIR Accelerator - mapping guide
├── FhirToCdm/             # OHDSI .NET Core FHIR→OMOP converter
├── ETL-German-FHIR-Core/  # OHDSI German MII FHIR→OMOP ETL
├── omoponfhir-v54-r4/     # FHIR R4 server on OMOP v5.4
├── NACHC-fhir-to-omop/    # Java FHIR→OMOP tools (Apache 2)
├── omopfhirmap/           # CLI tool for ATLAS cohort↔FHIR bundle
├── GT-FHIR/               # Georgia Tech FHIR server + mapping docs
├── FHIROntopOMOP/         # OMOP as FHIR Knowledge Graph (Ontop)
└── mends-on-fhir/         # OMOP→FHIR for chronic disease surveillance
```

### FHIR R4 Core (not in git)

Source: `https://fs.get-ig.org/rs/hl7.fhir.r4.core-4.0.1.ndjson.gz` (4,574 resources)

Two outputs are written by `bun src/load-fhir-core.ts`:

```
fhir-core/                 # Full canonical resources (one file per resourceType)
├── StructureDefinition.ndjson    # 655   resource/type definitions
├── ValueSet.ndjson               # 1,316 value sets
├── CodeSystem.ndjson             # 1,062 code systems
├── SearchParameter.ndjson        # 1,400 search parameters
├── ConceptMap.ndjson             # 80    concept maps
├── OperationDefinition.ndjson    # 47    operation definitions
├── CapabilityStatement.ndjson    # 6     capability statements
├── CompartmentDefinition.ndjson  # 6     compartment definitions
├── StructureMap.ndjson           # 2     structure maps
├── StructureDefinition-by-type.json   # SDs grouped by .type
└── index.json                    # Summary (source URL, downloadedAt, counts)

data/                      # Slim index — { url, resourceType, version, id } only
├── <ResourceType>.ndjson         # Same 9 types as above, one line per resource
└── index.json                    # Same summary as fhir-core/index.json
```

Use `data/` for fast canonical-URL lookups and inventories without parsing the
full resources; use `fhir-core/` when you need element definitions, concepts,
or any other body content.

Reload FHIR core: `bun src/load-fhir-core.ts` (rewrites both directories)

## Architecture: procedural ctx.fns (adapted from hyper-code2)

**One function per file. Folder = namespace. STRICTLY two-level: `src/<ns>/<fn>.ts`.**

> **No nesting under `src/`.** Code lives at `src/<ns>/<fn>.ts` and nowhere
> else. Anything deeper is a mistake — data files (SQL templates, JSON
> fixtures, CSV) belong **outside `src/`**, typically alongside `mapspec/`,
> `refs/`, or at the repo root. If you need versioned subfolders for data
> (e.g. `cdm_version/v531/`), keep them in a top-level dir; the scanner
> `loadFns`/`classify` does not recurse, but more importantly the convention
> is to keep `src/` thin and code-only.

Files in `src/` are scanned by `loadFns` and registered as `ctx.fns.<module>.<fn>`
(see `src/loadFns.ts` and `src/project/classify.ts`).

```
src/
  $main.ts                 entry: loadFns → genTypes → loadRoutes → server.start
  $type_Context.ts         global `Context` type
  ctx_ns.d.ts              AUTO-GEN — FnsRegistry, types.* — written by ctx.genTypes
  loadFns.ts               first-sweep loader (handles bootstrap before ctx.fns exists)
  genTypes.ts              ctx.genTypes — rescans src/ and writes ctx_ns.d.ts

  http/                    ctx.fns.http.* — Bun.serve + dynamic route table
  project/                 ctx.fns.project.* — scan / classify / roots
  repl/                    ctx.fns.repl.* — eval, load (hot-reload), POST /repl
  markdown/                ctx.fns.markdown.* — render, highlight, mermaid
  mapspec/                 ctx.fns.mapspec.* — list (edges loader), render (per-edge UI), loadEdges/byResource/byTable
  profiles/                ctx.fns.profiles.* — load (no cache), byId, viewForEdge, profileForEdge, valueSetByUrl
  db/                      ctx.fns.db.* — connect (shared Bun.SQL pool), query (REPL-friendly SQL)
  fhir/                    ctx.fns.fhir.* — init, ensureTable, loadBundle, loadDir (Bundle → fhir.*)
  omop/                    ctx.fns.omop.* — byTable (OMOP CDM v5.4 schema via CommonDataModel CSV)
  conceptmap/              ctx.fns.conceptmap.* — materialize (ConceptMap JSON → cm.<id> table)
  viewdef/                 ctx.fns.viewdef.* — path (FHIRPath wrapper), run, materialize (→ staging.*)
  diff/                    ctx.fns.diff.* — compareTables, createIndices, report
  etl_fhir/                ctx.fns.etl_fhir.* — runEdge (one stage-2 INSERT, source: mapspec/etl/*.sql)

  $route_GET.ts            GET /
  $route_profiles_GET.ts   GET /profiles
  $route_profiles_$id_GET.ts  GET /profiles/:id
  …
```

### Calling convention

- `export default async function (ctx: Context, opts: {...})` — **anonymous**, no function name. Every fn takes `ctx` first, then a single options-object.
- **Universal calling convention**: `ctx.fns.<ns>.<fn>(ctx, { ...opts })`. Single rule, no per-fn argument-order recall.
- Single-arg fns still take an opts wrapper: `profiles.byId(ctx, { id })`, not `profiles.byId(ctx, id)`.
- Zero-arg fns take `(ctx)` only (no opts wrapper): `profiles.load(ctx)`.
- Routes: `export default async function (ctx, _session, req)` — return `{ title, main, current? }` or a raw `Response`.

### No cross-imports between project files

- Call other modules through `ctx.fns.<ns>.<fn>(ctx, { ... })`, not `import`.
- Only `import` from `bun`, `node:*`, or third-party packages.

**Why this matters — transitive-import staleness during REPL hot-reload.**

When `A.ts` does `import B from "./B"`, Bun resolves and caches that import
once at compile time. `repl.load` reloads A by re-importing it with a
cache-buster (`A.ts?t=Date.now()`) — but the `import B` line inside the
fresh A still resolves to the **already-cached** B (no cache-buster), so
your edits to B don't propagate. Symptom: `repl.load` returns success, but
the running code keeps using the old B.

`ctx.fns` is late-bound: each call reads the current registry, so
`ctx.fns.B.fn(ctx)` always sees the latest reload. **Use it for every
cross-file call.** The only exceptions are:

- `import type` (erased at runtime, no cache concern) — but prefer
  declaring shared types in a `$type_*.ts` file so `genTypes` exposes them
  globally.
- pure-function utility imports inside a single namespace folder that
  never get hot-reloaded standalone — but even there, prefer ctx.fns for
  consistency and to avoid future surprises.

If you see "I edited B but the change doesn't appear" — first thing to
check is whether the caller uses `ctx.fns.B.fn` or `import { fn } from
"./B"`. If the latter, fix it or restart the server.

### Special filenames (`$` prefix stripped when registering in `ctx.fns`)

- `$main.ts` — entry point. NOT loaded into `ctx.fns`.
- `$route_<path>_<METHOD>.ts` — HTTP route. `_` in path = `/`, `$foo` = `:foo` param. See `src/http/loadRoutes.ts` and `src/project/classify.ts`.
- `$type_<Name>.ts` — type declaration only. Picked up by `ctx.genTypes` as `types.<mod>.<Name>` globally. Never `import type` from project files — use `types.<mod>.<Name>` directly.
- Other `$<name>.ts` (e.g. `$start.ts`) — regular function, loaded as `ctx.fns.<mod>.<name>`.

## REPL workflow (use this, don't restart!)

The server is long-running. Hot-reload everything from the REPL — restart only if something is genuinely broken.

```bash
# Start once
bun src/$main.ts &                    # writes port to .hyper/_runtime/port

# Send code to the running process (`return` not allowed; use console.log)
bun script/repl.ts '1 + 1'
bun script/repl.ts 'console.log(Object.keys(ctx.fns))'
bun script/repl.ts -f /tmp/play.js                     # from file
echo '...' | bun script/repl.ts                        # from stdin

# Hot-reload after editing a file
bun script/repl.ts 'await ctx.fns.repl.load(ctx, { name: "profiles" })'   # whole folder
bun script/repl.ts 'await ctx.fns.repl.load(ctx, { name: "mapspec.render" })'  # single fn
bun script/repl.ts 'await ctx.fns.http.loadRoutes(ctx)'                  # rescan $route_*.ts
bun script/repl.ts 'await ctx.genTypes(ctx)'                             # regen ctx_ns.d.ts

# Clear cached state (e.g. profile cache on ctx.state.profiles)
bun script/repl.ts 'delete ctx.state.profiles; console.log("cleared")'
```

After editing `src/<module>/<fn>.ts`:
1. `repl.load` the module (or just the fn).
2. `genTypes(ctx)` if you added/removed files or `$type_*.ts`.
3. `http.loadRoutes(ctx)` if you added/renamed a `$route_*.ts`.

The route module cache uses `?t=${Date.now()}` so route files reload on each `loadRoutes`. Non-route fn modules need an explicit `repl.load`.

### Postgres via `ctx.fns.db.query`

The running server holds a shared `Bun.SQL` pool (`src/db/connect.ts`).
Use it from the REPL for any ad-hoc query — no need to shell out to `psql`:

```bash
# Simple row read
bun script/repl.ts '
const r = await ctx.fns.db.query(ctx, { sql: "select count(*)::int as n from cdm.person" });
console.log(r);
'

# Parameterized — $1, $2, ... in the SQL
bun script/repl.ts '
const r = await ctx.fns.db.query(ctx, {
  sql: "select id from fhir.patient where id = $1",
  params: ["109b34ca-afb2-42b2-08a8-107af1cc6b6e"],
});
console.log(r);
'

# Multi-statement / DDL is fine — just pass via { sql }
bun script/repl.ts 'await ctx.fns.db.query(ctx, { sql: "truncate table fhir.observation" });'
```

DSN is taken from `$ATHENA_DSN` / `$FHIR_DSN` (default
`postgresql://athena:athena@localhost:54392/athena`). Same pool is reused by
`ctx.fns.fhir.*` and any SoF stage-2 SQL.

> **Note on jsonb params.** `db.query` does not pre-JSON-encode params, so
> don't pass JS objects as parameter values for `jsonb` columns — Bun's
> driver would double-encode and you'd store a JSON string scalar instead of
> the object. Either inline JSON via `'…'::jsonb` literals in the SQL (see
> `src/fhir/loadBundle.ts`) or extract the value out of an already-loaded
> row.

## Scripts

### `scripts/fhir-structuredef.ts` - Search FHIR StructureDefinitions
```sh
bun scripts/fhir-structuredef.ts Patient                    # Search by name
bun scripts/fhir-structuredef.ts --pretty Patient           # Compact output (token-efficient)
bun scripts/fhir-structuredef.ts --pretty --kind resource Observation
bun scripts/fhir-structuredef.ts --full Patient             # Show all elements
bun scripts/fhir-structuredef.ts --kind resource            # Filter by kind
bun scripts/fhir-structuredef.ts --list                     # List all
bun scripts/fhir-structuredef.ts --json Patient             # JSON output
```

Options:
- `--pretty` - Compact pretty print (name, cardinality, types only)
- `--full` - Show full definition with all elements and descriptions
- `--kind <kind>` - Filter: resource, complex-type, primitive-type, logical
- `--list` - List all (compact format)
- `--json` - Output as JSON

### `scripts/fhir-valueset.ts` - Search FHIR ValueSets
```sh
bun scripts/fhir-valueset.ts gender                   # Search by name
bun scripts/fhir-valueset.ts --pretty observation     # Compact output
bun scripts/fhir-valueset.ts --full administrative-gender  # Show concepts
bun scripts/fhir-valueset.ts --list                   # List all 1,316 ValueSets
bun scripts/fhir-valueset.ts --status active          # Filter by status
```

Options:
- `--pretty` - Compact pretty print (name, url, source systems)
- `--full` - Show full definition with included concepts
- `--status <status>` - Filter: active, draft, retired
- `--list` - List all (compact format)
- `--json` - Output as JSON

### `scripts/fhir-codesystem.ts` - Search FHIR CodeSystems
```sh
bun scripts/fhir-codesystem.ts gender                 # Search by name
bun scripts/fhir-codesystem.ts --pretty observation   # Compact output
bun scripts/fhir-codesystem.ts --full administrative-gender  # Show all codes
bun scripts/fhir-codesystem.ts --list                 # List all 1,062 CodeSystems
bun scripts/fhir-codesystem.ts --content complete     # Filter by content type
```

Options:
- `--pretty` - Compact pretty print (name, url, count)
- `--full` - Show full definition with all codes
- `--status <status>` - Filter: active, draft, retired
- `--content <content>` - Filter: complete, fragment, not-present
- `--list` - List all (grouped by content type)
- `--json` - Output as JSON

### `scripts/omop-table.ts` - Search OMOP CDM tables (uses DuckDB)
```sh
bun scripts/omop-table.ts person                    # Search by name
bun scripts/omop-table.ts --pretty person           # Compact output
bun scripts/omop-table.ts --pretty --desc person    # With field descriptions
bun scripts/omop-table.ts --list                    # List all 39 tables
bun scripts/omop-table.ts --list --schema CDM       # Filter by schema
bun scripts/omop-table.ts --full person             # Full descriptions
bun scripts/omop-table.ts --json person             # JSON output
bun scripts/omop-table.ts --sql "SELECT * FROM fields WHERE cdmDatatype = 'date'"
```

Options:
- `--pretty` - Compact pretty print (field, type, PK/FK)
- `--desc` - Add field descriptions (with --pretty)
- `--full` - Show full definition with descriptions
- `--schema <schema>` - Filter: CDM, VOCAB, RESULTS
- `--list` - List all tables
- `--sql <query>` - Run custom SQL (tables: `tables`, `fields`)
- `--json` - Output as JSON

## DuckDB

Used for querying CSV files with SQL. Useful SQL queries for OMOP:
```sh
# Find all date fields
bun scripts/omop-table.ts --sql "SELECT cdmTableName, cdmFieldName FROM fields WHERE cdmDatatype = 'date'"

# Count fields per table
bun scripts/omop-table.ts --sql "SELECT cdmTableName, COUNT(*) as cnt FROM fields GROUP BY 1 ORDER BY 2 DESC"

# Find all FK to CONCEPT table
bun scripts/omop-table.ts --sql "SELECT cdmTableName, cdmFieldName FROM fields WHERE fkTableName = 'CONCEPT'"

# List all data types
bun scripts/omop-table.ts --sql "SELECT DISTINCT cdmDatatype FROM fields ORDER BY 1"
```

DuckDB API usage:
```ts
import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

// Query CSV directly
db.all(`SELECT * FROM read_csv_auto('data.csv') WHERE col = 'value'`, (err, rows) => {
  console.log(rows);
});

// For complex CSVs with quoted fields containing commas/newlines:
db.all(`SELECT * FROM read_csv('data.csv',
  header = true,
  quote = '"',
  escape = '"',
  ignore_errors = true,
  null_padding = true,
  parallel = false
)`, callback);
```

Note: Bun may crash on cleanup (exit code 133) due to a Bun/DuckDB bug. Output is still correct.

## Mapping Data Model

The FHIR→OMOP mappings live under `mapspec/`, split into machine and human layers:

```
mapspec/
├── schema/edge.schema.json         # JSON Schema for edges
├── edges/<Resource>__<table>.json  # source of truth — 28 mapping edges
├── resources/<Resource>.md         # per-FHIR narrative (one file per resource)
└── <Resource>/<table>.md           # legacy detail markdowns (still used as a
                                     # rendering fallback when edges/*.json
                                     # is missing or thin)
```

`edges/<R>__<T>.json` is the load-bearing unit. Each edge has:

- `fhir_resource`, `omop_table`, `direction` (`fhir-to-omop` | `omop-to-fhir`),
  `status` (`documented` | `implemented` | `stub` | `planned`), `primary`,
  `required`, `condition` (e.g. when an Observation routes to `measurement`
  vs `observation`), `narrative_md`
- `fields[]` — column-level mapping. Each field has `omop_column`, `fhir_path`,
  `omop_type`/`fhir_type`, `required`/`pk`/`fk`/`concept_map`/`constant`,
  `notes`, and `sources[]`.
- `sources[]` (per field) — how each reference implementation handles this
  field. Each source has a `comment` (short differentiator) and
  `references[]` (`project`, `kind`, `path`, optional `lines: [from, to]`,
  optional `notes`). `path` points into `refs/refs/...`.
- `vocabularies[]` — inline static concept maps (e.g. gender → 8507/8532/…).
- `edge_cases[]` — per-edge gotchas with per-impl handling.
- `references[]` — edge-level reference implementations (with the same
  Reference shape used per-field).

Status (May 2026): 33 edges across 20 FHIR resources → 16 OMOP tables.
32 edges are `status: implemented` (wired stage-2 SQL in
`mapspec/etl/<R>__<T>.sql`, all covered by golden cases); 1 is `status: stub`
(Medication — `WHERE FALSE` by design, a vocabulary resource not a row
producer). Coverage / Specimen / MedicationDispense / MedicationStatement are
wired into the PLAN and golden-cased with synthetic FHIR even though a typical
cohort (e.g. Synthea) never emits them, so they fire only when their source
resource is present in `fhir.*`. On a ~105-patient FHIR cohort the full
orchestrator (cm.* → staging.* → cdm_ours_fhir.*) finishes in ~22 seconds and
populates 14 OMOP tables (~98k rows). `bun -e '...'` over the edge JSONs shows **136 / 478 fields** carry
per-field `sources[]`, totalling **327 source-groups** with concrete
file/line refs. The rest are trivial mappings (constants, single-impl,
source-value direct copies) — no fabrication, no sources beyond what
the markdowns supported.

Adding/editing a mapping: edit `mapspec/edges/<R>__<T>.json` (validate against
`mapspec/schema/edge.schema.json`). The renderer picks up changes after a
server restart (edge list is cached in process; see `src/mapspec/list.ts`).

### Two-stage transformation pipeline

ETL is split into **stage 1** (FHIR-flat) and **stage 2** (OMOP-mapped):

```
FHIR resource ── stage 1 ──▶ FHIR-flat row ── stage 2 ──▶ OMOP row
   (nested)     ViewDefinition    (staging.*)      JOIN cm.* + vocab.concept
                FHIRPath/SQL-on-FHIR             → cdm_ours_fhir.*
```

**Stage 1** ViewDefinitions live in `mapspec/views/<R>__<T>.view.json`. They
are FHIR-native — no OMOP knowledge:

- Paths drop the resource prefix (`birthDate`, not `Patient.birthDate`) and
  use SoF spec functions: `extension(url)` (with-where shorthand),
  `getReferenceKey()` (returns the bare id from `Reference.reference`;
  `src/viewdef/path.ts` handles both `urn:uuid:` Bundle-internals and
  `ResourceType/id` forms), `line.join(' ')`.
- Long URLs live in `constant` (e.g.
  `{"name": "usCoreRace", "valueString": "http://hl7.org/fhir/.../us-core-race"}`)
  and are referenced as `%usCoreRace`.
- Nested `select` with `forEach` / `forEachOrNull` / `unionAll` for repeating
  fields. Example: `forEachOrNull: "(address.where(use='official') | address).first()"`
  yields one address row per Patient (preferring `use='official'`, else first;
  emits a null row when there's no address so the outer join cardinality
  is preserved).
- Materialized into `staging.<target>` via `ctx.fns.viewdef.materialize` —
  writes a CSV to /tmp and streams it with psql `\copy` (orders of
  magnitude faster than per-row INSERT for large tables).

**Stage 2** SQL lives in `mapspec/etl/<R>__<T>.sql`. It is a single SELECT
the runner wraps with `TRUNCATE; INSERT INTO cdm_ours_fhir.<T>`. Columns
must be in the EXACT order of the target OMOP table (positional binding —
see `src/etl_fhir/runEdge.ts`). Concept resolution is **never inline CASE
expressions** — always a `LEFT JOIN cm.<id>` against a ConceptMap table:

```sql
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/race-omb-to-omop
SELECT
    referenceToId(v.id)                       AS person_id,
    COALESCE(r.concept_id, 0)                 AS race_concept_id,
    …
FROM staging.patient_person v
LEFT JOIN cm.race_omb_to_omop r ON r.source_code = v.race_omb_code;
```

Shared helpers live in `mapspec/etl/_functions.sql` (apply once, idempotent):
- `referenceToId(text) → bigint` — null-aware `hashtextextended(ref, 0)::bigint`
- `stringToId(text) → bigint` — same hash for any composite key (used for
  fan-out-safe surrogate ids, e.g. `stringToId(id || '|' || std_concept_id)`).

#### Canonical stage-2 patterns — two reference templates

Every stage-2 ETL should read like one of two committed templates. Match the
nearest one; don't invent a third shape.

1. **`Patient__person` style — clean single SELECT** (the default). One source
   resource → one OMOP row. A flat projection over `staging.<src>` with
   `LEFT JOIN cm.<id>` lookups for coded fields; no inline vocab cascade.
   Use for single-target, single-event edges. When a source carries several
   code systems for the *same* slot (RxNorm > NDC, SNOMED > CPT4 > HCPCS),
   pick the best one with a small `codes`/`resolved` CTE + `DISTINCT ON
   (staging_id) ORDER BY prio` — still one row out, the resolution stays local
   and readable. Examples: `Patient__person`, `Encounter__visit_occurrence`,
   `Medication*__drug_exposure`, `Immunization__drug_exposure`,
   `Procedure__procedure_occurrence`, `Device__device_exposure`,
   `AllergyIntolerance__observation`.

2. **`Condition__condition_occurrence` style — shared resolve pass** (for
   multi-target families). One source resource fans out to *several* OMOP
   tables by the resolved concept's `domain_id`. Use this **only** when the
   same vocab walk would otherwise run N times (once per sibling) or when a
   single resource legitimately produces rows in multiple OMOP tables:

   - **Stage-1 view** fans out `forEach: code.coding` (per-coding), carrying
     the union of all siblings' value slots, into one canonical staging table
     (`staging.<resource>_coded`). Sibling target tables share this one view —
     the duplicate per-target views are deleted.
   - **`mapspec/etl/_resolve_<resource>.sql`** walks
     `code_system → cm.fhir_system_to_omop_vocab → vocab.concept (source) →
     Maps-to → vocab.concept (standard)` exactly ONCE, `DISTINCT ON (id[,
     sub-key], std_concept_id)` to dedup, tags `std_domain` (+ resolves value /
     unit / operator alongside), and materializes `staging.<resource>_resolved`.
     The orchestrator runs every `_resolve_*.sql` after staging materialization
     and before stage-2 (see `script/etl-all.ts` §3b).
   - **Each sibling stage-2 SQL** is then a trivial `WHERE std_domain='X'`
     filter over the resolved table (alias `r`), with a fan-out-safe surrogate
     `stringToId(id || '|' || std_concept_id)`.

   Families on this pattern: **Condition** (→ condition_occurrence /
   observation / measurement / procedure_occurrence), **Observation** (+
   `Observation.component[]` via `_resolve_observation_component.sql`) and
   **DiagnosticReport** (→ measurement / observation / procedure_occurrence;
   `__note` stays a per-report single SELECT, style 1).

   Why: routing by a materialized `std_domain` column collapses N redundant
   4-table vocab JOINs into one, and per-coding fan-out stops dropping codings
   on multi-coded resources. The surrogate-id scheme (`stringToId(id || '|' ||
   std_concept_id)`) is internal — the golden cases under `cases/` assert on the
   resolved concept + natural keys, not the surrogate.

### ConceptMaps (`cm.*` tables)

ConceptMaps live alongside profiles at `mapspec/profiles/*.cm.json`. Each
is a normal FHIR `ConceptMap` resource. `ctx.fns.conceptmap.materialize`
flattens it into a `cm.<id>` table with one row per element across all
groups:

```sql
cm.<id>(
    source_code     text PRIMARY KEY,
    concept_id      integer NOT NULL,
    source_display  text,
    target_display  text,
    equivalence     text
)
```

`gender-to-omop` has TWO groups (admin-gender lowercase + v3-AdministrativeGender
uppercase) but one flat table — codes across groups must be unique. The
loader throws if a clash is detected.

### `@relatedArtefact` directive — view ↔ stage-2 ↔ ConceptMap

Stage-2 SQL declares its ConceptMap dependencies as comments at the top:

```sql
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/gender-to-omop
-- @relatedArtefact https://fhir2omop.health-samurai.io/ConceptMap/race-omb-to-omop
```

`src/mapspec/render.ts` parses these out and renders one ConceptMap card
per URL on the edge page (above the ETL SQL card). Edits to view JSONs no
longer need a profiles-cache clear — `src/profiles/load.ts` reads from
disk on every call.

## Data Quality (DQD as SQL-on-FHIR SQLQuery-Library)

OHDSI DQD check families re-expressed as SQL-on-FHIR **SQLQuery-Library**
resources (per [HL7/sql-on-fhir#375](https://github.com/HL7/sql-on-fhir/issues/375)):
each check is a `Library(type=sqlquery)` whose SQL returns the FAILING rows
(0 rows = pass) plus DataQualityCheck metadata (Kahn category, threshold,
severity). Run against any populated OMOP schema (`cdm_ours_fhir`, or a schema
holding an external gold like `cdm_gold`).

```
script/gen-dqchecks.ts        # CDM v5.4 field catalog → mapspec/dqchecks/*.sqlquery.json (258 checks)
mapspec/dqchecks/*.json       # the generated SQLQuery-Library check resources (committed artifact)
src/dq/run.ts                 # ctx.fns.dq.run — execute checks vs a schema, pctViolatedRows report
script/dq.ts                  # CLI: bun script/dq.ts [schema] → writes .hyper/_runtime/dq-<schema>.json
script/load-gold.ts           # load an external OMOP gold CSV set into a schema (e.g. cdm_gold) to DQD-check it
src/dq/$route_GET.ts          # GET /dq   — dashboard (schema switcher, category/table grouping, All/Failing filter)
src/dq/$route_$id_GET.ts      # GET /dq/:id — drill-down: SQL (shiki) + actual failing rows
```

Check families generated: `cdmNotNullable`, `isPrimaryKey`, `isForeignKey`,
`conceptRecordCompleteness` (concept_id = 0 rate), `plausibleStartBeforeEnd`,
`plausibleGender` (OHDSI concept-gender catalog `mapspec/dq_concept_gender.tsv`),
`measureValueCompleteness`, `sourceValueCompleteness`. Threshold is a flat 5% for completeness (stricter than
reference DQD's per-field thresholds — a known follow-up). Follow-up: faithful descendant-rollup, per-field thresholds.

See `docs/connectathon-dqd-report.md` for the experiment comparing our output to
the F2O Connectathon gold oracle.

> **Reference normalization on load.** Synthea (and other sources) reference
> serviceProvider / participant by *conditional/identifier* reference
> (`Organization?identifier=sys|val`), not by `Type/id`, so FKs never line up
> with `.id`-hashed surrogate keys. `script/normalize-refs.ts` (or
> `bun script/load-fhir.ts <dir> --normalize`) rewrites every resource id to
> `uuid5(identifier)` and remaps all references to match — run once after load,
> before ETL.

## Viewer App (Bun + htmx)

`bun src/$main.ts` boots the dev server on `:3000` (override with `$PORT`).
Bootstrap: `loadFns` registers every `src/**/<fn>.ts` into `ctx.fns.<dir>.<fn>`,
`genTypes` writes `src/ctx_ns.d.ts` so TS knows the registry shape,
`http.loadRoutes` registers everything matching `$route_*_<METHOD>.ts`,
`http.start` binds the server. Hot iteration: kill the process, restart.
Edits to `src/$layout.ts` / `src/mapspec/render.ts` need a restart.

URL map (registered automatically — see startup log):

| URL | Source | Purpose |
|---|---|---|
| `GET /` | `src/$route_GET.ts` | Home: stats, Sankey graph, edge matrix |
| `GET /mapspec/:resource` | `src/mapspec/$route_$resource_GET.ts` | Resource page: destinations panel + narrative MD |
| `GET /mapspec/:resource/:table` | `src/mapspec/$route_$resource_$table_GET.ts` | Edge detail: field list with per-field sources (collapsible) |
| `GET /table/:name` | `src/$route_table_$name_GET.ts` | OMOP table page: list of FHIR sources for the table |
| `GET /source?path=&from=&to=` | `src/$route_source_GET.ts` | File viewer with line-range highlight (used by reference links) |
| `POST /repl` | `src/repl/$route__POST.ts` | Server-side REPL for poking at `ctx` |

Layout (`src/$layout.ts`) wraps every response in a sidebar + main pane.
Sidebar groups FHIR Resources and OMOP Tables; OMOP table headers link to
`/table/<name>`.

**htmx**: `<body hx-boost="true" hx-target="#main-content"
hx-select="#main-content" hx-select-oob="#sidebar" hx-swap="outerHTML">`.
Sidebar clicks only swap the central pane + OOB-update the sidebar so the
active highlight follows. `document.title` is refreshed from a hidden
`<span data-page-title>` marker on every swap. The source viewer's `<pre>`
opts out with `hx-boost="false"` so `#L123` line anchors do native jumps.

Render path for the edge detail page (the only nontrivial one):
`render.ts` resolves the edge JSON from `loadEdges()`, then `renderEdge()`
emits a header, the field list (one card per `fields[]` entry with badges,
notes, and a `<details>` per-field-sources disclosure), the vocabularies,
edge cases, and edge-level references. Every reference with a `path` is
linked through `renderReference()` to `/source?path=...&from=...&to=...`.

## File-Based Routing & Module Convention

`src/project/classify.ts` is the canonical reference. Stem-based rules:

- `$route_<seg>_<seg>_<METHOD>.ts` — route. Underscores split into URL
  segments; segments starting with `$` become `:params`. Module path
  prefixes the URL. So `src/mapspec/$route_$resource_$table_GET.ts` →
  `GET /mapspec/:resource/:table`.
- `<name>.ts` (no `$` prefix) → registered as `ctx.fns.<dir>.<name>`.
- `$<name>.ts` (e.g. `$layout.ts`, `$start.ts`) → top-level "root fn" or
  module-private (strips the `$`).
- `$type_<Name>.ts` → contributes a `type` to `ctx_ns.d.ts`.
- `$setting_<key>.ts` → settings (must live under a module folder).
- `$script_<name>.js|css` → static asset bundled by Bun on demand.

Match function (`src/http/match.ts`) is a simple segment-by-segment Express
clone. **Caveat**: there is no specificity ordering — literal segments do
not beat `:params` if registered later. Avoid ambiguous paths (e.g. don't
add `/mapspec/tables/:name` because it collides with `/mapspec/:resource/:table`).
That is why the table page lives at `/table/:name`, not under `/mapspec/`.

Route handlers return either a `Response` (used verbatim) or a plain object
`{ title, current, main }` which is run through `ctx.layout()` to apply the
sidebar/HTML chrome.

## Key External Resources
- OMOP CDM docs: https://ohdsi.github.io/CommonDataModel/
- Athena vocabularies: https://athena.ohdsi.org/
- Book of OHDSI: https://ohdsi.github.io/TheBookOfOhdsi/
- FHIR R4 spec: https://hl7.org/fhir/R4/

---

## Bun Runtime

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
