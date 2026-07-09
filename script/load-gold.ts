#!/usr/bin/env bun
// Load an external OMOP gold-standard set (CSV-per-table) into a schema so the
// DQD checks can run against it — e.g. the F2O Connectathon "Focused Gold
// Standard Tables". The CSVs are WG participant artifacts and are NOT
// redistributed in this repo; point this at your local copy.
//
//   bun script/load-gold.ts <dir-of-gold-csvs> [schema=cdm_gold]
//
// Each <table>[_<timestamp>].csv is loaded into <schema>.<table>, created
// `LIKE cdm_ours_fhir.<table>` (proper OMOP v5.4 types), with the column list
// taken from the CSV header. Then: bun script/dq.ts <schema>
import { $ } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const schema = process.argv[3] ?? "cdm_gold";
if (!dir) { console.error("usage: bun script/load-gold.ts <dir-of-gold-csvs> [schema]"); process.exit(2); }

const DSN = process.env.ATHENA_DSN ?? "postgresql://athena:athena@localhost:54392/athena";
const psql = (sql: string) => $`psql ${DSN} -v ON_ERROR_STOP=1 -q -c ${sql}`;

await psql(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);

const csvs = readdirSync(dir).filter((f) => f.endsWith(".csv"));
if (!csvs.length) { console.error(`no .csv files in ${dir}`); process.exit(1); }

for (const f of csvs) {
    const table = f.replace(/_\d+\.csv$/, "").replace(/\.csv$/, "");  // strip trailing _<timestamp>
    const path = join(dir, f);
    // column list from the header line (strip quotes/CR)
    const header = (await Bun.file(path).text()).split("\n", 1)[0]!.replace(/[\r"]/g, "");
    try {
        await psql(`CREATE TABLE ${schema}.${table} (LIKE cdm_ours_fhir.${table} INCLUDING DEFAULTS);`);
        await $`psql ${DSN} -v ON_ERROR_STOP=1 -q -c ${`\\copy ${schema}.${table}(${header}) FROM '${path}' WITH (FORMAT csv, HEADER true)`}`;
        console.log(`  ${schema}.${table} ← ${f}`);
    } catch (e: any) {
        console.error(`  ${table}: ${e.message?.split("\n")[0]}`);
    }
}
console.log(`done — run: bun script/dq.ts ${schema}`);
