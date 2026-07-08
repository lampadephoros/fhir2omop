#!/usr/bin/env bun
// Run the SQLQuery-Library DQ checks against a populated OMOP schema.
//   bun script/dq.ts                 # cdm_ours_fhir
//   bun script/dq.ts <schema>        # other schema
//   bun script/dq.ts <schema> <substr>   # only checks whose file matches substr
const ctx: any = { env: process.env, fns: {}, state: {} };
ctx.fns.db = { query: (await import("../src/db/query")).default };
ctx.fns.dq = { run: (await import("../src/dq/run")).default };

const schema = process.argv[2] ?? "cdm_ours_fhir";
const filter = process.argv[3];
const r = await ctx.fns.dq.run(ctx, { schema, filter });

// persist for the /dq dashboard page — a per-schema file plus a "last run"
// pointer so the page can offer a schema switcher.
try {
    const payload = JSON.stringify({ ranAt: new Date().toISOString(), ...r }, null, 2);
    await Bun.write(`.hyper/_runtime/dq-${schema}.json`, payload);
    await Bun.write(".hyper/_runtime/dq-results.json", payload);
} catch { /* runtime dir may not exist */ }

// group failures/errors by kahn category
const bad = r.results.filter((x: any) => x.status === "FAIL" || x.status === "ERROR");
for (const x of bad) {
    const detail = x.status === "FAIL" ? `${x.violated}/${x.total} rows (${x.pct}% > ${x.threshold}%)` : x.reason;
    console.log(`  ${x.status === "FAIL" ? "✗" : "!"} [${x.kahn}/${x.severity}] ${x.id}  — ${detail}`);
}
console.log(`\n${"=".repeat(60)}`);
console.log(`${r.pass} pass, ${r.fail} fail, ${r.errored} error, ${r.na} n/a  (of ${r.total})  schema=${r.schema}`);
process.exit(r.fail || r.errored ? 1 : 0);
