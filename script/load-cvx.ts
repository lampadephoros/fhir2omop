#!/usr/bin/env bun
// Load the REAL OHDSI CVX vocabulary (vaccine codes) into vocab.* — surgical,
// non-destructive, fast. No full Athena reload.
//
// Why this exists: Immunization.vaccineCode is CVX-coded and CVX is the
// preferred OMOP Drug vocabulary for vaccines. The default Athena bundle was
// generated WITHOUT CVX, so vaccines otherwise resolve to drug_concept_id=0.
// This splices the real CVX (normal concept_ids, Standard flags, 'Maps to'
// self/cross maps) out of a CVX-inclusive Athena bundle into the existing
// vocab.*, replacing any prior CVX rows. See docs/cvx-vocabulary.md.
//
// Source of the bundle (in priority order):
//   1. a path argument: a bundle .zip OR an unzipped bundle dir
//   2. $CVX_BUNDLE_URL / the default public "magic URL" — downloaded to a temp
//      file (the bundle carries only CVX + the shared vocabs; the licensed
//      SNOMED/CPT4 come from your main Athena load, this just adds CVX).
//
//   bun script/load-cvx.ts                       # download from the magic URL
//   bun script/load-cvx.ts path/to/bundle.zip    # local zip
//   bun script/load-cvx.ts path/to/bundle-dir/   # unzipped dir
//
// It: (1) extracts CVX concepts from CONCEPT.csv, (2) extracts CVX 'Maps to'
// rows from CONCEPT_RELATIONSHIP.csv, (3) pulls any 'Maps to' target concepts
// not already present, (4) in one transaction DELETEs the old CVX and INSERTs
// the real CVX + missing targets + relationships. Idempotent.

import { $, SQL } from "bun";
import { statSync } from "node:fs";
import { join } from "node:path";

// Public capability URL (sha256-hashed path) for the CVX-inclusive Athena
// bundle. Override with $CVX_BUNDLE_URL. See docs/cvx-vocabulary.md.
const MAGIC_URL = process.env.CVX_BUNDLE_URL ??
    "https://storage.googleapis.com/atomic-ehr-athena-public/240cac7c2e8d7a578ed64661372caa37b85dd2b6fd601522e271886e95a32fe2/athena-bundle-20260707-v20260227-cvx.zip";

const DSN = process.env.ATHENA_DSN ?? "postgresql://athena:athena@localhost:54392/athena";
const sql = new SQL(DSN);
const work = process.env.TMPDIR ?? "/tmp";

// Resolve the bundle source: a given path, or download the magic URL.
let src = process.argv[2];
let downloaded: string | null = null;
if (!src) {
    downloaded = join(work, `cvx-bundle.${process.pid}.zip`);
    console.log(`no path given — downloading CVX bundle from:\n  ${MAGIC_URL}`);
    await $`curl -fsSL -o ${downloaded} ${MAGIC_URL}`;
    src = downloaded;
}

// Stream CSVs from a dir or straight out of the zip (unzip -p), so we never
// extract the multi-GB files to disk.
const isZip = statSync(src).isFile();
const cat = (name: string) =>
    isZip ? $`unzip -p ${src} ${name}`.lines() : $`cat ${join(src!, name)}`.lines();

const fConcept = join(work, `cvx_concept.${process.pid}.tsv`);
const fRel = join(work, `cvx_rel.${process.pid}.tsv`);
const fTgt = join(work, `cvx_tgt.${process.pid}.tsv`);

// 1. CVX concepts (vocabulary_id in column 4, tab-delimited, no quoting)
console.log("scanning CONCEPT.csv for CVX…");
const cvxIds = new Set<string>();
const conceptLines: string[] = [];
for await (const line of cat("CONCEPT.csv")) {
    const f = line.split("\t");
    if (f[3] === "CVX") { cvxIds.add(f[0]!); conceptLines.push(line); }
}
if (!cvxIds.size) { console.error("no CVX rows in CONCEPT.csv — is this a CVX-inclusive bundle?"); process.exit(1); }
await Bun.write(fConcept, conceptLines.join("\n") + "\n");
console.log(`  ${cvxIds.size} CVX concepts`);

// 2. CVX 'Maps to' relationships (concept_id_1 ∈ CVX)
console.log("scanning CONCEPT_RELATIONSHIP.csv for CVX 'Maps to'…");
const relLines: string[] = [];
const targetIds = new Set<string>();
for await (const line of cat("CONCEPT_RELATIONSHIP.csv")) {
    const f = line.split("\t");
    if (cvxIds.has(f[0]!) && f[2] === "Maps to" && !f[5]) { relLines.push(line); targetIds.add(f[1]!); }
}
await Bun.write(fRel, relLines.join("\n") + "\n");
console.log(`  ${relLines.length} 'Maps to' rows`);

// 3. Maps-to targets not already in vocab.concept and not themselves CVX
const nonCvxTargets = [...targetIds].filter((id) => !cvxIds.has(id) && /^\d+$/.test(id));
let missing: string[] = [];
if (nonCvxTargets.length) {
    // inline the id list (all validated integers) — Bun.SQL doesn't bind a JS
    // array to a `$1::bigint[]` placeholder.
    const rows = await sql.unsafe(
        `SELECT t.id::text AS id FROM unnest(ARRAY[${nonCvxTargets.join(",")}]::bigint[]) AS t(id)
         LEFT JOIN vocab.concept c ON c.concept_id = t.id WHERE c.concept_id IS NULL`,
    );
    missing = rows.map((r: any) => r.id);
}
if (missing.length) {
    console.log(`  ${missing.length} Maps-to target concepts missing locally — pulling from CONCEPT.csv…`);
    const want = new Set(missing);
    const tgtLines: string[] = [];
    for await (const line of cat("CONCEPT.csv")) {
        if (want.has(line.slice(0, line.indexOf("\t")))) tgtLines.push(line);
    }
    await Bun.write(fTgt, tgtLines.join("\n") + "\n");
} else {
    console.log("  all Maps-to targets already present locally");
    await Bun.write(fTgt, "");
}

// 4. load in one transaction via psql (\copy is client-side)
const load = `
CREATE TEMP TABLE stg_c (concept_id text, concept_name text, domain_id text, vocabulary_id text, concept_class_id text, standard_concept text, concept_code text, valid_start_date text, valid_end_date text, invalid_reason text);
\\copy stg_c FROM '${fConcept}' WITH (FORMAT csv, DELIMITER E'\\t', HEADER false, QUOTE E'\\b', NULL '')
CREATE TEMP TABLE stg_t (LIKE stg_c);
\\copy stg_t FROM '${fTgt}' WITH (FORMAT csv, DELIMITER E'\\t', HEADER false, QUOTE E'\\b', NULL '')
CREATE TEMP TABLE stg_r (concept_id_1 text, concept_id_2 text, relationship_id text, valid_start_date text, valid_end_date text, invalid_reason text);
\\copy stg_r FROM '${fRel}' WITH (FORMAT csv, DELIMITER E'\\t', HEADER false, QUOTE E'\\b', NULL '')

BEGIN;
DELETE FROM vocab.concept_relationship WHERE concept_id_1 IN (SELECT concept_id FROM vocab.concept WHERE vocabulary_id='CVX') OR concept_id_2 IN (SELECT concept_id FROM vocab.concept WHERE vocabulary_id='CVX');
DELETE FROM vocab.concept WHERE vocabulary_id='CVX';
INSERT INTO vocab.concept (concept_id, concept_name, domain_id, vocabulary_id, concept_class_id, standard_concept, concept_code, valid_start_date, valid_end_date, invalid_reason)
SELECT concept_id::int, concept_name, domain_id, vocabulary_id, concept_class_id, NULLIF(standard_concept,''), concept_code, to_date(NULLIF(valid_start_date,''),'YYYYMMDD'), to_date(NULLIF(valid_end_date,''),'YYYYMMDD'), NULLIF(invalid_reason,'')
FROM (SELECT * FROM stg_c UNION ALL SELECT * FROM stg_t) s;
INSERT INTO vocab.concept_relationship (concept_id_1, concept_id_2, relationship_id, valid_start_date, valid_end_date, invalid_reason)
SELECT concept_id_1::int, concept_id_2::int, relationship_id, to_date(NULLIF(valid_start_date,''),'YYYYMMDD'), to_date(NULLIF(valid_end_date,''),'YYYYMMDD'), NULLIF(invalid_reason,'')
FROM stg_r;
INSERT INTO vocab.vocabulary (vocabulary_id, vocabulary_name, vocabulary_reference, vocabulary_version, vocabulary_concept_id)
SELECT 'CVX', 'CDC Vaccine Administered (CVX)', 'OMOP Athena', 'CVX (Athena bundle)', 0
WHERE NOT EXISTS (SELECT 1 FROM vocab.vocabulary WHERE vocabulary_id='CVX');
UPDATE vocab.vocabulary SET vocabulary_version='CVX (Athena bundle, real)' WHERE vocabulary_id='CVX';
COMMIT;
`;
console.log("loading into vocab.* …");
const fLoad = join(work, `cvx_load.${process.pid}.sql`);
await Bun.write(fLoad, load);
await $`psql ${DSN} -v ON_ERROR_STOP=1 -q -f ${fLoad}`.quiet();
await $`rm -f ${fLoad}`.quiet().nothrow();
await sql.unsafe("ANALYZE vocab.concept; ANALYZE vocab.concept_relationship;");

const [{ std }] = await sql.unsafe(
    `SELECT count(*)::int std FROM vocab.concept WHERE vocabulary_id='CVX' AND standard_concept='S'`);
console.log(`done: CVX reloaded (${cvxIds.size} concepts, ${std} Standard) with real 'Maps to' crosswalks.`);
await $`rm -f ${fConcept} ${fRel} ${fTgt} ${downloaded ?? ""}`.quiet().nothrow();
await sql.end();
