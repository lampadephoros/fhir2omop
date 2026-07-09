// Shared isolated-schema FHIR→OMOP pipeline machinery, used by both
// run-cases.ts (golden-case gate) and run-connectathon.ts (external gold
// oracle). Loads fhir[] into throwaway t_fhir/t_staging/t_cdm schemas, runs
// stage-1 views → resolves → stage-2, all pointed at those schemas. The two
// callers differ only in edge selection and what they assert afterwards.
import { readdirSync } from "node:fs";
import { PLAN, colCount } from "./etl-plan";

const DSN = process.env.ATHENA_DSN ?? "postgresql://athena:athena@localhost:54392/athena";

export type Edge = (typeof PLAN)[number];
export type Schemas = { fhir: string; staging: string; cdm: string };

export const schemas = (suffix: string): Schemas => ({
    fhir: `t_fhir_${suffix}`, staging: `t_staging_${suffix}`, cdm: `t_cdm_${suffix}`,
});
export const snake = (rt: string) => rt.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
export const tbl = (q: string) => q.split(".")[1]!;
export const resolveFiles = readdirSync("mapspec/etl")
    .filter((f) => f.startsWith("_resolve_") && f.endsWith(".sql")).sort();

// Redirect the pipeline schemas onto the throwaway t_* schemas. `vocab` (RC_VOCAB)
// optionally redirects vocab.* to a seed subset for hermetic runs.
export function subSchemas(body: string, T: Schemas, vocab?: string): string {
    let b = body.replaceAll("staging.", T.staging + ".").replaceAll("cdm_ours_fhir.", T.cdm + ".");
    if (vocab) b = b.replaceAll("vocab.", vocab + ".");
    return b;
}

export async function runScript(sqlText: string): Promise<void> {
    const proc = Bun.spawn(["psql", DSN, "-v", "ON_ERROR_STOP=1", "-q"], {
        stdin: new TextEncoder().encode(sqlText), stdout: "pipe", stderr: "pipe",
    });
    if ((await proc.exited) !== 0) {
        const err = (await new Response(proc.stderr).text()).split("\n").filter(Boolean).slice(-4).join(" | ");
        throw new Error(err);
    }
}

export async function resetSchemas(T: Schemas): Promise<void> {
    await runScript(`DROP SCHEMA IF EXISTS ${T.fhir} CASCADE; DROP SCHEMA IF EXISTS ${T.staging} CASCADE; DROP SCHEMA IF EXISTS ${T.cdm} CASCADE;
        CREATE SCHEMA ${T.fhir}; CREATE SCHEMA ${T.staging}; CREATE SCHEMA ${T.cdm};`);
}

export async function loadFhir(T: Schemas, resources: any[]): Promise<Set<string>> {
    const byType = new Map<string, any[]>();
    for (const r of resources) { if (!r?.resourceType) continue; if (!byType.has(r.resourceType)) byType.set(r.resourceType, []); byType.get(r.resourceType)!.push(r); }
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

// Materialize the canonical (max-column) view per staging table, over every
// resource present — mirroring the production orchestrator, so resolve passes
// that read sibling staging tables always find them.
export async function materializeStaging(ctx: any, T: Schemas, present: Set<string>): Promise<void> {
    const best = new Map<string, { edge: string; src: string; cols: number }>();
    for (const p of PLAN.filter((p) => present.has(tbl(p.src)))) {
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
}

// Run every _resolve_*.sql (skip silently when their input staging is absent).
export async function runResolves(T: Schemas, vocab?: string, onErr?: (f: string, msg: string) => void): Promise<void> {
    for (const f of resolveFiles) {
        try { await runScript(subSchemas(await Bun.file(`mapspec/etl/${f}`).text(), T, vocab)); }
        catch (e: any) { onErr?.(f, e.message); }
    }
}

// Run stage-2 for the given edges into t_cdm (truncate/create first writer per
// target, append after). Returns the set of tables actually produced.
export async function runStage2(T: Schemas, edges: Edge[], vocab?: string, onErr?: (edge: string, msg: string) => void): Promise<Set<string>> {
    const produced = new Set<string>(); const created = new Set<string>();
    for (const p of edges) {
        const sf = `mapspec/etl/${p.edge}.sql`;
        if (!(await Bun.file(sf).exists())) continue;
        const target = `${T.cdm}.${tbl(p.target)}`;
        if (!created.has(target)) { await runScript(`CREATE TABLE ${target} (LIKE ${p.target} INCLUDING DEFAULTS);`); created.add(target); }
        const body = subSchemas(await Bun.file(sf).text(), T, vocab);
        const stmt = p.mode === "update" ? body : `INSERT INTO ${target}\n${body}`;
        try { await runScript(stmt); produced.add(tbl(p.target)); }
        catch (e: any) { onErr?.(p.edge, e.message); }
    }
    return produced;
}
