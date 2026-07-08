#!/usr/bin/env bun
// Run the HL7 FHIR-to-OMOP Connectathon 2026 sample suite through OUR pipeline
// and diff against their gold answer key (expected_results.json).
//
// This is a SEPARATE conformance runner from `run-cases.ts` (our own exact,
// branch-by-branch gate). It exists so we can quickly answer "do we pass their
// suite?" — it loads every fixture through the real FHIR→OMOP pipeline (isolated
// schemas, full Athena vocab incl. real CVX), matches each positive fixture's
// expected concept_ids, and re-runs each negative fixture in isolation to assert
// it is excluded (0 rows).
//
//   bun script/run-connectathon.ts                 # default vendored gold set
//   bun script/run-connectathon.ts <other-dir>     # a different bundle dir
import { SQL } from "bun";
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN, colCount } from "./etl-plan";

const DIR = process.argv[2] ?? "tests/connectathon-f2o-2026";
if (!existsSync(join(DIR, "expected_results.json"))) {
    console.error(`no expected_results.json under ${DIR}`); process.exit(2);
}

const DSN = process.env.ATHENA_DSN ?? "postgresql://athena:athena@localhost:54392/athena";
const sql = new SQL(DSN, { idleTimeout: 0, maxLifetime: 0 });
const SUF = String(process.pid);
const T = { fhir: `t_fhir_${SUF}`, staging: `t_staging_${SUF}`, cdm: `t_cdm_${SUF}` };

const snake = (rt: string) => rt.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const tbl = (q: string) => q.split(".")[1]!;
const subSchemas = (b: string) => b.replaceAll("staging.", T.staging + ".").replaceAll("cdm_ours_fhir.", T.cdm + ".");
const resolveFiles = readdirSync("mapspec/etl").filter((f) => f.startsWith("_resolve_") && f.endsWith(".sql")).sort();

const ctx: any = { env: process.env, fns: {}, state: {} };
ctx.fns.db = { query: (await import("../src/db/query")).default };
ctx.fns.viewdef = { materialize: (await import("../src/viewdef/materialize")).default };

async function runScript(sqlText: string) {
    const proc = Bun.spawn(["psql", DSN, "-v", "ON_ERROR_STOP=1", "-q"], {
        stdin: new TextEncoder().encode(sqlText), stdout: "pipe", stderr: "pipe",
    });
    if ((await proc.exited) !== 0) {
        const err = (await new Response(proc.stderr).text()).split("\n").filter(Boolean).slice(-4).join(" | ");
        throw new Error(err);
    }
}

const EXCLUDE = process.env.EXCLUDE;
// recursively read every *.json FHIR resource under a dir (skip manifests)
function readResources(dir: string): any[] {
    const out: any[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (EXCLUDE && p.includes(EXCLUDE)) continue;
        if (statSync(p).isDirectory()) { out.push(...readResources(p)); continue; }
        if (!name.endsWith(".json") || name === "expected_results.json") continue;
        try {
            const r = JSON.parse(readFileSync(p, "utf8"));
            if (r?.resourceType === "Bundle") for (const e of (r.entry ?? [])) { if (e.resource) out.push(e.resource); }
            else if (r?.resourceType) out.push(r);
        } catch (e: any) { console.error(`skip ${name}: ${e.message}`); }
    }
    return out;
}
// read a single expected-fixture file into a resource list
function readFixture(rel: string): any[] {
    try {
        const r = JSON.parse(readFileSync(join(DIR, rel), "utf8"));
        if (r?.resourceType === "Bundle") return (r.entry ?? []).map((e: any) => e.resource).filter(Boolean);
        return r?.resourceType ? [r] : [];
    } catch { return []; }
}

async function loadFhir(resources: any[]): Promise<Set<string>> {
    const byType = new Map<string, any[]>();
    for (const r of resources) { if (!r?.resourceType) continue; (byType.get(r.resourceType) ?? byType.set(r.resourceType, []).get(r.resourceType)!).push(r); }
    let ddl = "";
    for (const [rt, list] of byType) {
        const t = `${T.fhir}.${snake(rt)}`;
        ddl += `CREATE TABLE ${t} (id text PRIMARY KEY, resource jsonb NOT NULL);\n`;
        const seen = new Set<string>();
        for (const r of list) {
            if (!r.id || seen.has(r.id)) continue; seen.add(r.id);
            const lit = JSON.stringify(r).replaceAll("'", "''");
            ddl += `INSERT INTO ${t} (id, resource) VALUES ('${String(r.id).replaceAll("'", "''")}', '${lit}'::jsonb);\n`;
        }
    }
    await runScript(ddl);
    return new Set([...byType.keys()].map(snake));
}

async function runPipeline(present: Set<string>): Promise<Set<string>> {
    const edges = PLAN.filter((p) => present.has(tbl(p.src)));
    const best = new Map<string, { edge: string; src: string; cols: number }>();
    for (const p of edges) {
        const vf = `mapspec/views/${p.edge}.view.json`;
        if (!(await Bun.file(vf).exists())) continue;
        const cols = colCount(JSON.parse(await Bun.file(vf).text()));
        const ex = best.get(p.staging);
        if (!ex || cols > ex.cols) best.set(p.staging, { edge: p.edge, src: p.src, cols });
    }
    for (const [staging, { edge, src }] of best) {
        const vd = JSON.parse(await Bun.file(`mapspec/views/${edge}.view.json`).text());
        await ctx.fns.viewdef.materialize(ctx, { viewDefinition: vd, source: `${T.fhir}.${tbl(src)}`, target: `${T.staging}.${tbl(staging)}` });
        await runScript(`ANALYZE ${T.staging}.${tbl(staging)};`);
    }
    for (const f of resolveFiles) {
        try { await runScript(subSchemas(await Bun.file(`mapspec/etl/${f}`).text())); } catch { /* input absent */ }
    }
    const produced = new Set<string>(); const created = new Set<string>();
    for (const p of edges) {
        const sf = `mapspec/etl/${p.edge}.sql`;
        if (!(await Bun.file(sf).exists())) continue;
        const target = `${T.cdm}.${tbl(p.target)}`;
        if (!created.has(target)) { await runScript(`CREATE TABLE ${target} (LIKE ${p.target} INCLUDING DEFAULTS);`); created.add(target); }
        const body = subSchemas(await Bun.file(sf).text());
        const stmt = p.mode === "update" ? body : `INSERT INTO ${target}\n${body}`;
        try { await runScript(stmt); produced.add(tbl(p.target)); } catch (e: any) { console.error(`[stage2 ${p.edge}] ${e.message}`); }
    }
    return produced;
}

async function fetchRows(table: string): Promise<any[]> {
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema=${T.cdm} AND table_name=${table} ORDER BY ordinal_position`;
    if (!cols.length) return [];
    const sel = cols.map((c: any) => `"${c.column_name}"::text AS "${c.column_name}"`).join(", ");
    return await sql.unsafe(`SELECT ${sel} FROM ${T.cdm}.${table}`);
}

async function resetSchemas() {
    await runScript(`DROP SCHEMA IF EXISTS ${T.fhir} CASCADE; DROP SCHEMA IF EXISTS ${T.staging} CASCADE; DROP SCHEMA IF EXISTS ${T.cdm} CASCADE;
        CREATE SCHEMA ${T.fhir}; CREATE SCHEMA ${T.staging}; CREATE SCHEMA ${T.cdm};`);
}
// reset → load → run pipeline → rows per table
async function produce(resources: any[]): Promise<{ produced: Set<string>; rowsByTable: Record<string, any[]> }> {
    await resetSchemas();
    const present = await loadFhir(resources);
    const produced = await runPipeline(present);
    const rowsByTable: Record<string, any[]> = {};
    for (const t of produced) rowsByTable[t] = await fetchRows(t);
    return { produced, rowsByTable };
}

// ── run the whole set together (positives) ──
const { produced, rowsByTable } = await produce(readResources(DIR));
console.log(`produced tables: ${[...produced].join(", ")}\n`);

// PERSIST_CDM=<schema> clones the produced OMOP into a durable schema so DQD
// can run against the connectathon output: bun script/dq.ts <schema>
if (process.env.PERSIST_CDM) {
    const s = process.env.PERSIST_CDM;
    await runScript(`DROP SCHEMA IF EXISTS ${s} CASCADE; CREATE SCHEMA ${s};`);
    for (const t of produced) await runScript(`CREATE TABLE ${s}.${t} AS SELECT * FROM ${T.cdm}.${t};`);
    console.log(`persisted OMOP → schema ${s}  (DQD: bun script/dq.ts ${s})\n`);
}

const expected = JSON.parse(readFileSync(join(DIR, "expected_results.json"), "utf8")).expected;
const srcvalCol: Record<string, string> = {
    condition_occurrence: "condition_source_value", measurement: "measurement_source_value",
    procedure_occurrence: "procedure_source_value", drug_exposure: "drug_source_value",
    observation: "observation_source_value", note: "note_source_value",
};
const isNegative = (t: string, ex: any) =>
    t === "(none)" || ex.rows === "0" || /EXCLUDED|REJECTED|QUARANTINED/.test(JSON.stringify(ex));

let ok = 0, bad = 0;
const report: string[] = [];

for (const e of expected) {
    const t = e.omop_table; const ex = e.expect; const fx = e.fixture;

    // Negatives: run in isolation, assert zero rows anywhere (intrinsic exclusion).
    if (isNegative(t, ex)) {
        const { rowsByTable: rbt } = await produce(readFixture(fx));
        const total = Object.values(rbt).reduce((n, rows) => n + rows.length, 0);
        if (total === 0) { report.push(`✓ NEG  ${fx}  (${t}) → 0 rows (excluded as expected)`); ok++; }
        else {
            const where = Object.entries(rbt).filter(([, r]) => r.length).map(([tb, r]) => `${tb}:${r.length}`).join(", ");
            report.push(`✗ NEG  ${fx}  (${t}) → expected exclusion but produced ${total} row(s) [${where}]`); bad++;
        }
        continue;
    }

    const rows = rowsByTable[t] ?? [];
    const svc = srcvalCol[t];
    const wantSV = ex[`${t.split("_")[0]}_source_value`] ?? ex.condition_source_value ?? ex.measurement_source_value ?? ex.procedure_source_value ?? ex.drug_source_value;
    const cand = wantSV ? rows.filter((r) => svc && String(r[svc]) === String(wantSV)) : rows;
    if (!cand.length) { report.push(`✗ MISS ${fx}  (${t}) source_value=${wantSV} → 0 produced rows`); bad++; continue; }
    const diffs: string[] = [];
    for (const [k, v] of Object.entries(ex)) {
        if (typeof v !== "string" || /note|panel|MRN|>=|convention|policy|self-report|decoded/i.test(k + String(v))) continue;
        if (!/concept_id|value_as_number|_source_value|unit/.test(k)) continue;
        if (k.startsWith("systolic") || k.startsWith("diastolic")) continue;
        const got = cand.map((r) => r[k]).filter((x) => x != null);
        if (!got.some((g) => String(g) === String(v))) diffs.push(`${k}: want ${v} got [${got.join(",")}]`);
    }
    if (!diffs.length) { report.push(`✓ OK   ${fx}  (${t})`); ok++; }
    else { report.push(`✗ DIFF ${fx}  (${t})\n        ` + diffs.join("\n        ")); bad++; }
}

console.log(report.join("\n"));
console.log(`\n${"=".repeat(60)}\n${ok} pass, ${bad} fail  (of ${expected.length})`);
await runScript(`DROP SCHEMA IF EXISTS ${T.fhir} CASCADE; DROP SCHEMA IF EXISTS ${T.staging} CASCADE; DROP SCHEMA IF EXISTS ${T.cdm} CASCADE;`).catch(() => {});
await sql.end();
process.exit(bad ? 1 : 0);
