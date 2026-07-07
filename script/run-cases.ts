#!/usr/bin/env bun
// Run FHIR→OMOP golden test cases (cases/*.json) through the REAL Postgres
// pipeline and assert the expected OMOP rows.
//
// For each variant: reset isolated schemas (t_fhir / t_staging / t_cdm),
// load fhir[] into t_fhir.*, run the relevant edges (materialize view →
// _resolve_*.sql → stage-2 SQL, all pointed at the t_* schemas via a
// `staging.`→`t_staging.` substitution) into t_cdm.*, then assert omop.
// vocab.* + cm.* (full Athena) are shared read-only.
//
//   bun script/run-cases.ts                      # all cases
//   bun script/run-cases.ts patient              # only files matching substring
//   bun script/run-cases.ts -v                   # verbose (print every diff)
import { SQL } from "bun";
import { readdirSync } from "node:fs";
import { PLAN, colCount } from "./etl-plan";

const DSN = process.env.ATHENA_DSN ?? "postgresql://athena:athena@localhost:54392/athena";
const sql = new SQL(DSN, { idleTimeout: 0, maxLifetime: 0 });

// Per-process schema suffix so concurrent `run-cases` invocations (e.g. several
// case-authoring agents self-verifying at once) don't clobber each other's t_*.
const SUF = process.env.RC_SUFFIX ?? String(process.pid);
const T = { fhir: `t_fhir_${SUF}`, staging: `t_staging_${SUF}`, cdm: `t_cdm_${SUF}` };
const args = process.argv.slice(2);
const verbose = args.includes("-v");
const filter = args.find((a) => !a.startsWith("-"));

const PK_BY_TABLE: Record<string, string> = {
    person: "person_id", location: "location_id", care_site: "care_site_id", provider: "provider_id",
    visit_occurrence: "visit_occurrence_id", condition_occurrence: "condition_occurrence_id",
    procedure_occurrence: "procedure_occurrence_id", measurement: "measurement_id", observation: "observation_id",
    note: "note_id", drug_exposure: "drug_exposure_id", device_exposure: "device_exposure_id",
    death: "person_id", observation_period: "observation_period_id",
    specimen: "specimen_id", payer_plan_period: "payer_plan_period_id",
};

const ctx: any = { env: process.env, fns: {}, state: {} };
ctx.fns.db = { query: (await import("../src/db/query")).default };
ctx.fns.viewdef = { materialize: (await import("../src/viewdef/materialize")).default };

const snake = (rt: string) => rt.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const tbl = (q: string) => q.split(".")[1]!;
// Redirect both pipeline schemas to the isolated test schemas: staging.* (the
// stage-1 materializations) and cdm_ours_fhir.* (cross-table reads like
// Patient__observation_period JOIN visit_occurrence, and the PractitionerRole
// UPDATE target). vocab.* / cm.* (full Athena) stay shared, read-only.
// RC_VOCAB redirects vocab.* to a subset schema (hermetic runs from the seed);
// unset = use full Athena vocab.*. cm.* (profile-derived, Athena-independent)
// always stays as-is.
const VOCAB = process.env.RC_VOCAB;
const subSchemas = (body: string) => {
    let b = body.replaceAll("staging.", T.staging + ".").replaceAll("cdm_ours_fhir.", T.cdm + ".");
    if (VOCAB) b = b.replaceAll("vocab.", VOCAB + ".");
    return b;
};
const resolveFiles = readdirSync("mapspec/etl").filter((f) => f.startsWith("_resolve_") && f.endsWith(".sql")).sort();

// Shared fixtures: resources every variant implicitly gets, so a constant
// Patient/Encounter/Org isn't repeated in each variant. cases/_fixtures.json
// (global) + a file-level "fixtures":[...]; a variant's own fhir[] overrides a
// fixture with the same resourceType/id. Merge order = global, file, variant.
function mergeFhir(...lists: any[][]): any[] {
    const byKey = new Map<string, any>();
    for (const list of lists) for (const r of (list ?? [])) if (r?.resourceType && r?.id) byKey.set(`${r.resourceType}/${r.id}`, r);
    return [...byKey.values()];
}
let GLOBAL_FIXTURES: any[] = [];
try { GLOBAL_FIXTURES = JSON.parse(await Bun.file("cases/_fixtures.json").text()).fixtures ?? []; } catch { /* none */ }

async function runScript(sqlText: string): Promise<void> {
    const proc = Bun.spawn(["psql", DSN, "-v", "ON_ERROR_STOP=1", "-q"], {
        stdin: new TextEncoder().encode(sqlText), stdout: "pipe", stderr: "pipe",
    });
    if ((await proc.exited) !== 0) {
        const err = (await new Response(proc.stderr).text()).split("\n").filter(Boolean).slice(-4).join(" | ");
        throw new Error(err);
    }
}

async function resetSchemas() {
    await runScript(`
        DROP SCHEMA IF EXISTS ${T.fhir} CASCADE; DROP SCHEMA IF EXISTS ${T.staging} CASCADE; DROP SCHEMA IF EXISTS ${T.cdm} CASCADE;
        CREATE SCHEMA ${T.fhir}; CREATE SCHEMA ${T.staging}; CREATE SCHEMA ${T.cdm};`);
}

async function loadFhir(resources: any[]): Promise<Set<string>> {
    const byType = new Map<string, any[]>();
    for (const r of resources) {
        if (!r?.resourceType) continue;
        if (!byType.has(r.resourceType)) byType.set(r.resourceType, []);
        byType.get(r.resourceType)!.push(r);
    }
    let ddl = "";
    for (const [rt, list] of byType) {
        const t = `${T.fhir}.${snake(rt)}`;
        ddl += `CREATE TABLE ${t} (id text PRIMARY KEY, resource jsonb NOT NULL);\n`;
        for (const r of list) {
            const lit = JSON.stringify(r).replaceAll("'", "''");
            ddl += `INSERT INTO ${t} (id, resource) VALUES ('${String(r.id).replaceAll("'", "''")}', '${lit}'::jsonb);\n`;
        }
    }
    await runScript(ddl);
    return new Set([...byType.keys()].map(snake));
}

// Resources whose edges fan out to several OMOP tables via a shared resolve
// pass — for these we run ALL sibling edges so mis-routing to the wrong table
// is caught (a row leaking into a table the case didn't list).
const RESOLVE_FAMILY = new Set(["fhir.condition", "fhir.observation", "fhir.diagnostic_report"]);

async function runPipeline(present: Set<string>, slug: string, expectedTables: Set<string>): Promise<Set<string>> {
    // primary (resource, table) from the filename: <res>--<table>--<aspect>
    const [resPart, tablePart] = slug.split("--");
    const primaryTable = (tablePart ?? "").replaceAll("-", "_");
    const primaryFhir = [...present].find((t) => t.replaceAll("_", "") === resPart);
    const primarySrc = primaryFhir ? `fhir.${primaryFhir}` : null;
    const runTargets = new Set([...expectedTables, primaryTable]);

    let edges = PLAN.filter((p) => present.has(tbl(p.src)));
    edges = edges.filter((p) =>
        RESOLVE_FAMILY.has(p.src)
            ? p.src === primarySrc                         // all siblings of the primary resolve family
            : runTargets.has(tbl(p.target)));              // else only expected + primary targets
    if (!edges.length) return new Set();

    // 1. materialize staging (canonical max-column view per staging table).
    // Materialize for EVERY resource present in the case — not just the
    // expected-target edges — mirroring the production orchestrator
    // (etl-all.ts materializes all views before resolves). Resolve passes may
    // read sibling staging tables (e.g. _resolve_condition.sql falls back to
    // staging.encounter_visit for the condition date), so those must exist
    // whenever the case ships the source resource.
    const best = new Map<string, { edge: string; src: string; cols: number }>();
    for (const p of PLAN.filter((p) => present.has(tbl(p.src)))) {
        const vf = `mapspec/views/${p.edge}.view.json`;
        if (!(await Bun.file(vf).exists())) continue;
        const cols = colCount(JSON.parse(await Bun.file(vf).text()));
        const ex = best.get(p.staging);
        if (!ex || cols > ex.cols) best.set(p.staging, { edge: p.edge, src: p.src, cols });
    }
    const materialized = new Set<string>();
    for (const [staging, { edge, src }] of best) {
        const vd = JSON.parse(await Bun.file(`mapspec/views/${edge}.view.json`).text());
        await ctx.fns.viewdef.materialize(ctx, {
            viewDefinition: vd, source: `${T.fhir}.${tbl(src)}`, target: `${T.staging}.${tbl(staging)}`,
        });
        materialized.add(tbl(staging));
        await runScript(`ANALYZE ${T.staging}.${tbl(staging)};`);
    }

    // 2. resolve passes (skip silently when their input staging is absent)
    for (const f of resolveFiles) {
        try { await runScript(subSchemas(await Bun.file(`mapspec/etl/${f}`).text())); } catch (e: any) { if (verbose) console.log(`    [resolve ${f}] ${e.message}`); }
    }

    // 3. stage-2 edges → t_cdm (truncate first writer per target, then append)
    const produced = new Set<string>();
    const created = new Set<string>();
    for (const p of edges) {
        const sf = `mapspec/etl/${p.edge}.sql`;
        if (!(await Bun.file(sf).exists())) continue;
        const target = `${T.cdm}.${tbl(p.target)}`;
        if (!created.has(target)) {
            await runScript(`CREATE TABLE ${target} (LIKE ${p.target} INCLUDING DEFAULTS);`);
            created.add(target);
        }
        const body = subSchemas(await Bun.file(sf).text());
        const stmt = p.mode === "update" ? body : `INSERT INTO ${target}\n${body}`;
        try { await runScript(stmt); produced.add(tbl(p.target)); }
        catch (e: any) { if (verbose) console.log(`    [stage2 ${p.edge}] ${e.message}`); }
    }
    return produced;
}

// ── assertion ────────────────────────────────────────────────────────────────
function clean(exp: any) { const o: any = {}; for (const k of Object.keys(exp)) if (!k.endsWith("__name")) o[k] = exp[k]; return o; }

async function refToId(id: string): Promise<string> {
    const r = await sql`SELECT referenceToId(${id})::text AS h`;
    return r[0].h;
}

// Rows are fetched all-as-text (PG canonical naive representation), so `a` is
// always a string or null; `e` is the JSON-typed expected value.
function valEq(a: any, e: any): boolean {
    if (a === null || a === undefined) return e === null || e === undefined;
    if (e === null || e === undefined) return false;
    const A = String(a), E = String(e);
    if (A === E) return true;                                                       // exact (incl. big int FKs)
    if (/^\d{4}-\d{2}-\d{2}$/.test(E)) return A.slice(0, 10) === E;                  // date-only expected
    if (/^\d{4}-\d{2}-\d{2}T/.test(E)) return A.replace(" ", "T").slice(0, E.length) === E; // datetime expected
    const na = Number(A), ne = Number(E);
    if (!isNaN(na) && !isNaN(ne) && A.trim() !== "" && E.trim() !== "") return na === ne; // numeric
    return false;
}

// Fetch every column cast to ::text so Bun's driver never coerces a naive
// timestamp to a TZ-shifted Date or truncates a 64-bit id to a float.
async function fetchRows(schema: string, table: string): Promise<any[]> {
    const cols = await sql`SELECT column_name FROM information_schema.columns
        WHERE table_schema = ${schema} AND table_name = ${table} ORDER BY ordinal_position`;
    if (!cols.length) throw new Error(`${schema}.${table} does not exist`);
    const sel = cols.map((c: any) => `"${c.column_name}"::text AS "${c.column_name}"`).join(", ");
    return await sql.unsafe(`SELECT ${sel} FROM ${schema}.${table}`);
}

// `ref:<logical-id>` → referenceToId('<logical-id>') (precomputed in refMap).
// `id:<token>`       → a symbolic binding: the token takes the actual value the
//                      first time it's matched and must stay consistent across
//                      all rows (cross-row FK equality / derived surrogate keys
//                      like location_id = stringToId(address) that aren't a
//                      referenceToId of any fhir resource). proposed binds are
//                      committed by the caller only when the whole row matches.
function rowMatches(exp: any, act: any, pk: string | undefined, refMap: Map<string, string>, bindings: Map<string, any>): { ok: boolean; col?: string; a?: any; e?: any; proposed?: Map<string, any> } {
    const ec = clean(exp);
    const proposed = new Map<string, any>();
    for (const col of Object.keys(act)) {
        if (col === pk && !(col in ec)) continue; // derived surrogate PK, not asserted
        if (col in ec) {
            let e = ec[col];
            if (typeof e === "string" && e.startsWith("ref:")) {
                e = refMap.get(e.slice(4)) ?? "__UNRESOLVED__";
                if (!valEq(act[col], e)) return { ok: false, col, a: act[col], e };
                continue;
            } else if (typeof e === "string" && e.startsWith("id:")) {
                const tok = e.slice(3);
                const known = bindings.get(tok) ?? proposed.get(tok);
                if (known !== undefined) { if (!valEq(act[col], known)) return { ok: false, col, a: act[col], e: known }; }
                else if (act[col] === null) return { ok: false, col, a: null, e: `id:${tok} (non-null)` };
                else proposed.set(tok, act[col]);
                continue;
            }
            if (!valEq(act[col], e)) return { ok: false, col, a: act[col], e };
        } else if (act[col] !== null) {
            return { ok: false, col, a: act[col], e: null };
        }
    }
    return { ok: true, proposed };
}

const normalizeOmop = (omop: any): Record<string, any[]> =>
    Array.isArray(omop)
        ? omop.reduce((o: any, r: any) => { const { table, ...rest } = r; (o[table] ??= []).push(rest); return o; }, {})
        : (omop ?? {});

// Resolve many logical ids → referenceToId() in one round-trip.
async function batchRefToId(ids: string[]): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    if (!ids.length) return m;
    const arr = ids.map((s) => `'${String(s).replaceAll("'", "''")}'`).join(",");
    const rows = await sql.unsafe(`SELECT x, referenceToId(x)::text AS h FROM unnest(ARRAY[${arr}]::text[]) x`);
    for (const r of rows) m.set(r.x, r.h);
    return m;
}

// ── seed collection (DUMP_SEED=1) ────────────────────────────────────────────
// Accumulate every concept_id the pipeline actually touched (output rows +
// resolve intermediates) so we can dump the minimal vocab subset the cases need.
async function collectConcepts(set: Set<string>) {
    for (const schema of [T.cdm, T.staging]) {
        const tabs = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`;
        for (const { table_name } of tabs) {
            const cols = await sql`SELECT column_name FROM information_schema.columns
                WHERE table_schema = ${schema} AND table_name = ${table_name} AND column_name LIKE '%concept_id'`;
            for (const { column_name } of cols) {
                const rows = await sql.unsafe(`SELECT DISTINCT "${column_name}"::text AS v FROM ${schema}.${table_name} WHERE "${column_name}" IS NOT NULL AND "${column_name}" <> 0`);
                for (const r of rows) if (r.v) set.add(r.v);
            }
        }
    }
}

// Source concepts are looked up by (system, code) inside the resolve and never
// appear in an output column (e.g. the SNOMED *value* concept behind
// value_as_concept_id). Seed them by resolving every coding in the cases' FHIR
// through cm.fhir_system_to_omop_vocab → vocab.concept, plus UCUM units.
async function seedFromCaseCodes(set: Set<string>) {
    const codings = new Set<string>();
    const walk = (o: any) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (typeof o.code === "string") codings.add(`${o.system ?? ""}|${o.code}`);
        for (const v of Object.values(o)) walk(v);
    };
    GLOBAL_FIXTURES.forEach(walk);
    for (const f of readdirSync("cases").filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
        const c = JSON.parse(await Bun.file(`cases/${f}`).text());
        (c.fixtures ?? []).forEach(walk);
        for (const v of (c.cases ?? [c])) for (const r of (v.fhir ?? [])) walk(r);
    }
    for (const sc of codings) {
        const [system, code] = sc.split("|");
        const viaCm = await sql`SELECT c.concept_id::text v FROM cm.fhir_system_to_omop_vocab sa
            JOIN vocab.concept c ON c.vocabulary_id = sa.target_code AND c.concept_code = ${code} WHERE sa.source_code = ${system}`;
        for (const r of viaCm) set.add(r.v);
        const ucum = await sql`SELECT concept_id::text v FROM vocab.concept WHERE vocabulary_id = 'UCUM' AND concept_code = ${code}`;
        for (const r of ucum) set.add(r.v);
    }
}

async function dumpSeed(ids: Set<string>) {
    if (!ids.size) { console.log("(no concepts collected — nothing to seed)"); return; }
    const lit = (v: any) => (v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);
    // Expand with Maps-to targets so every resolve JOIN lands inside the seed.
    const tgt = await sql.unsafe(`SELECT DISTINCT concept_id_2::text AS v FROM vocab.concept_relationship
        WHERE relationship_id = 'Maps to' AND invalid_reason IS NULL AND concept_id_1 IN (${[...ids].join(",")})`);
    for (const r of tgt) ids.add(r.v);
    const idList = [...ids].join(",");
    const concepts = await sql.unsafe(`SELECT concept_id::text c1, concept_name c2, domain_id c3, vocabulary_id c4,
        concept_class_id c5, standard_concept c6, concept_code c7, valid_start_date::text c8, valid_end_date::text c9, invalid_reason c10
        FROM vocab.concept WHERE concept_id IN (${idList}) ORDER BY concept_id`);
    const rels = await sql.unsafe(`SELECT concept_id_1::text c1, concept_id_2::text c2, relationship_id c3,
        valid_start_date::text c4, valid_end_date::text c5, invalid_reason c6
        FROM vocab.concept_relationship WHERE relationship_id = 'Maps to' AND invalid_reason IS NULL
        AND concept_id_1 IN (${idList}) AND concept_id_2 IN (${idList}) ORDER BY concept_id_1, concept_id_2`);
    // Proper-ancestor pairs within the seed set — needed by the specificity
    // dedup (f2o-036) in the _resolve_*.sql passes (drop a concept when a
    // more-specific descendant of it is also resolved for the same resource).
    const anc = await sql.unsafe(`SELECT ancestor_concept_id::text c1, descendant_concept_id::text c2,
        min_levels_of_separation::text c3, max_levels_of_separation::text c4
        FROM vocab.concept_ancestor
        WHERE ancestor_concept_id <> descendant_concept_id
        AND ancestor_concept_id IN (${idList}) AND descendant_concept_id IN (${idList})
        ORDER BY ancestor_concept_id, descendant_concept_id`);
    let out = `-- Minimal vocab subset for the FHIR->OMOP golden test cases (cases/*.json).
-- Generated: DUMP_SEED=1 bun script/run-cases.ts   (do not edit by hand)
-- ${concepts.length} concepts, ${rels.length} 'Maps to' relationships, ${anc.length} ancestor pairs.
-- Lets the cases run without the full ~928MB Athena bundle: load this into a
-- fresh Postgres 'vocab' schema, build cm.* from mapspec/profiles/*.cm.json,
-- then run the cases. See cases/README.md.

CREATE SCHEMA IF NOT EXISTS vocab;
CREATE TABLE IF NOT EXISTS vocab.concept (concept_id integer PRIMARY KEY, concept_name text, domain_id text, vocabulary_id text, concept_class_id text, standard_concept text, concept_code text, valid_start_date date, valid_end_date date, invalid_reason text);
CREATE TABLE IF NOT EXISTS vocab.concept_relationship (concept_id_1 integer, concept_id_2 integer, relationship_id text, valid_start_date date, valid_end_date date, invalid_reason text);
CREATE TABLE IF NOT EXISTS vocab.concept_ancestor (ancestor_concept_id integer, descendant_concept_id integer, min_levels_of_separation integer, max_levels_of_separation integer);
TRUNCATE vocab.concept, vocab.concept_relationship, vocab.concept_ancestor;
`;
    for (const c of concepts) out += `INSERT INTO vocab.concept VALUES (${[c.c1, c.c2, c.c3, c.c4, c.c5, c.c6, c.c7, c.c8, c.c9, c.c10].map(lit).join(", ")});\n`;
    for (const r of rels) out += `INSERT INTO vocab.concept_relationship VALUES (${[r.c1, r.c2, r.c3, r.c4, r.c5, r.c6].map(lit).join(", ")});\n`;
    for (const a of anc) out += `INSERT INTO vocab.concept_ancestor VALUES (${[a.c1, a.c2, a.c3, a.c4].map(lit).join(", ")});\n`;
    await Bun.write("cases/_vocab_seed.sql", out);
    console.log(`\nwrote cases/_vocab_seed.sql — ${concepts.length} concepts, ${rels.length} relationships, ${anc.length} ancestor pairs`);
}

// ── main ───────────────────────────────────────────────────────────────────
const seedSet = new Set<string>();
const files = readdirSync("cases").filter((f) => f.endsWith(".json") && (!filter || f.includes(filter))).sort();
let pass = 0, fail = 0;
const failedCases: string[] = [];
const results: Record<string, { variants: { desc: string; pass: boolean; failures: string[] }[] }> = {};

for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const file = JSON.parse(await Bun.file(`cases/${f}`).text());
    const fileFixtures = Array.isArray(file.fixtures) ? file.fixtures : [];
    const cases = Array.isArray(file.cases) ? file.cases : [{ desc: file.title, fhir: file.fhir, omop: file.omop }];
    results[slug] = { variants: [] };
    console.log(`\n${f}`);
    const vFail: string[][] = cases.map(() => []); // failures per variant

    try {
        // ONE batch per file: every variant's resources have file-unique ids
        // (see script/rename-case-ids.ts), so fixtures ⊕ each variant's fhir[]
        // load together and run through the pipeline in a single pass — no
        // runtime namespacing needed.
        const allFhir: any[] = [];
        const meta: Array<{ i: number; omopByTable: Record<string, any[]>; resourceIds: string[] }> = cases.map((v: any, i: number) => {
            const merged = mergeFhir(GLOBAL_FIXTURES, fileFixtures, v.fhir);
            allFhir.push(...merged);
            return { i, omopByTable: normalizeOmop(v.omop), resourceIds: merged.map((r: any) => r.id).filter(Boolean) };
        });

        await resetSchemas();
        const present = await loadFhir(mergeFhir(allFhir)); // dedup shared fixtures across variants
        const expectedTables = new Set<string>(meta.flatMap((m) => Object.keys(m.omopByTable)));
        const produced = await runPipeline(present, slug, expectedTables);
        if (process.env.DUMP_SEED) await collectConcepts(seedSet);

        // resolve every ref: target + resource id in one round-trip
        const ids = new Set<string>();
        for (const m of meta) {
            for (const id of m.resourceIds) ids.add(id);
            for (const rows of Object.values(m.omopByTable)) for (const row of rows) for (const val of Object.values(row))
                if (typeof val === "string" && val.startsWith("ref:")) ids.add(val.slice(4));
        }
        const idMap = await batchRefToId([...ids]);
        const owners = meta.map((m) => new Set(m.resourceIds.map((id) => idMap.get(id)).filter(Boolean)));

        // fetch each table's rows once; `used` is shared across variants so the
        // file-level total is enforced (no row double-counted, none left over).
        const tables = new Set<string>([...expectedTables, ...produced]);
        const actualBy: Record<string, any[]> = {};
        const usedBy: Record<string, boolean[]> = {};
        for (const t of tables) {
            try { actualBy[t] = await fetchRows(T.cdm, t); usedBy[t] = new Array(actualBy[t].length).fill(false); }
            catch { actualBy[t] = []; usedBy[t] = []; }
        }

        for (const m of meta) {
            const refMap = new Map<string, string>();
            for (const rows of Object.values(m.omopByTable)) for (const row of rows) for (const val of Object.values(row))
                if (typeof val === "string" && val.startsWith("ref:")) refMap.set(val.slice(4), idMap.get(val.slice(4)) ?? "__UNRESOLVED__");
            const bindings = new Map<string, any>();
            for (const [table, expRows] of Object.entries(m.omopByTable)) {
                const actual = actualBy[table] ?? [], used = usedBy[table] ?? [];
                if (!actual.length && expRows.length) { vFail[m.i]!.push(`${table}: not produced (expected ${expRows.length})`); continue; }
                const pk = PK_BY_TABLE[table];
                for (const exp of expRows) {
                    let found = -1, last: any = null, fp: Map<string, any> | undefined;
                    for (let j = 0; j < actual.length; j++) {
                        if (used[j]) continue;
                        const r = rowMatches(exp, actual[j], pk, refMap, bindings);
                        if (r.ok) { found = j; fp = r.proposed; break; } else last = r;
                    }
                    if (found >= 0) { used[found] = true; if (fp) for (const [k, v] of fp) bindings.set(k, v); }
                    else { const h = last ? ` (closest ${last.col}: got ${JSON.stringify(last.a)} want ${JSON.stringify(last.e)})` : ""; vFail[m.i]!.push(`${table}: no actual row matches expected${h}`); }
                }
            }
        }

        // leftover (unmatched) actual rows = unexpected → attribute to the owning variant
        for (const t of tables) {
            const actual = actualBy[t] ?? [], used = usedBy[t] ?? [];
            for (let j = 0; j < actual.length; j++) {
                if (used[j]) continue;
                const row = actual[j];
                const idVals = Object.entries(row).filter(([k]) => k.endsWith("_id")).map(([, v]) => v).filter((v) => v != null).map(String);
                const owner = meta.find((m) => idVals.some((v) => owners[m.i]!.has(v)));
                const msg = `${t}: unexpected row (concept ${row[`${t}_concept_id`] ?? "?"})`;
                if (owner) vFail[owner.i]!.push(msg); else vFail[0]!.push(`${t}: unexpected row not attributable to a variant`);
            }
        }
    } catch (e: any) {
        for (let i = 0; i < cases.length; i++) vFail[i]!.push(`ERROR: ${e.message}`);
    }

    for (let i = 0; i < cases.length; i++) {
        const okv = vFail[i]!.length === 0;
        results[slug].variants.push({ desc: cases[i].desc ?? `variant ${i + 1}`, pass: okv, failures: vFail[i]! });
        if (okv) { pass++; console.log(`  ✓ [${i + 1}] ${cases[i].desc}`); }
        else { fail++; failedCases.push(`${f} #${i + 1}`); console.log(`  ✗ [${i + 1}] ${cases[i].desc}`); for (const x of vFail[i]!) console.log(`        ${x}`); }
    }
}

// Write results to the runtime dir (merge with prior runs so a filtered run
// only updates the files it ran). The /cases UI reads this for pass/fail badges.
try {
    const path = ".hyper/_runtime/case-results.json";
    let prior: any = { files: {} };
    try { prior = JSON.parse(await Bun.file(path).text()); } catch { /* none yet */ }
    const merged = { ranAt: new Date().toISOString(), files: { ...(prior.files ?? {}), ...results } };
    await Bun.write(path, JSON.stringify(merged, null, 2));
} catch (e: any) { console.log(`(could not write results file: ${e.message})`); }

if (process.env.DUMP_SEED) { await seedFromCaseCodes(seedSet); await dumpSeed(seedSet); }

console.log(`\n${"=".repeat(50)}\n${pass} passed, ${fail} failed  (of ${pass + fail})`);
if (fail) console.log("failed: " + failedCases.join(", "));
await runScript(`DROP SCHEMA IF EXISTS ${T.fhir} CASCADE; DROP SCHEMA IF EXISTS ${T.staging} CASCADE; DROP SCHEMA IF EXISTS ${T.cdm} CASCADE;`).catch(() => {});
await sql.end();
process.exit(fail ? 1 : 0);
