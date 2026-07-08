// ctx.fns.dq.run — execute the SQLQuery-Library data-quality checks
// (mapspec/dqchecks/*.sqlquery.json, per HL7/sql-on-fhir#375) against a
// populated OMOP schema and return a pass/fail report.
//
// Each check's content SQL returns the FAILING rows; pass = pctViolatedRows
// (failing / table rowcount) <= the check's dq-threshold-pct. Empty tables are
// skipped (NA). Mirrors OHDSI DQD's pctViolatedRows semantics.
import { readdirSync } from "node:fs";

export default async function (ctx: any, opts?: { dir?: string; schema?: string; filter?: string }) {
    const dir = opts?.dir ?? "mapspec/dqchecks";
    const schema = opts?.schema ?? "cdm_ours_fhir";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sqlquery.json") && (!opts?.filter || f.includes(opts.filter))).sort();

    const ext = (lib: any, url: string) => lib.extension?.find((e: any) => e.url.endsWith(url));
    const rowcount = new Map<string, number>();
    async function tableRows(table: string): Promise<number> {
        if (rowcount.has(table)) return rowcount.get(table)!;
        let n = 0;
        try { n = (await ctx.fns.db.query(ctx, { sql: `SELECT count(*)::int AS n FROM ${schema}.${table}` }))[0]?.n ?? 0; }
        catch { n = -1; } // table absent
        rowcount.set(table, n); return n;
    }

    const results: any[] = [];
    for (const f of files) {
        const lib = JSON.parse(await Bun.file(`${dir}/${f}`).text());
        const table = lib.parameter?.find((p: any) => p.name === "cdmTable")?.valueString;
        const kahn = ext(lib, "dq-kahn-category")?.valueCode;
        const checkType = ext(lib, "dq-check-type")?.valueString;
        const threshold = ext(lib, "dq-threshold-pct")?.valueDecimal ?? 0;
        const severity = ext(lib, "dq-severity")?.valueCode;
        let sql = lib.content?.[0]?.data as string;
        // schema override (checks are authored against cdm_ours_fhir)
        if (schema !== "cdm_ours_fhir") sql = sql.replaceAll("cdm_ours_fhir.", `${schema}.`);

        const total = table ? await tableRows(table) : 0;
        if (total < 0) { results.push({ id: lib.id, status: "NA", reason: "table absent", table, kahn, checkType, severity }); continue; }
        if (total === 0) { results.push({ id: lib.id, status: "NA", reason: "empty table", table, kahn, checkType, severity }); continue; }

        let violated = 0, err: string | undefined;
        try { violated = (await ctx.fns.db.query(ctx, { sql: `SELECT count(*)::int AS n FROM (${sql}) q` }))[0]?.n ?? 0; }
        catch (e: any) { err = e.message?.split("\n")[0]; }
        if (err) {
            // a referenced (FK-target) table not existing in this schema → not
            // applicable here, not a failure.
            const status = /does not exist/.test(err) ? "NA" : "ERROR";
            results.push({ id: lib.id, status, reason: err, table, kahn, checkType, severity }); continue;
        }

        const pct = total ? (violated / total) * 100 : 0;
        const pass = pct <= threshold;
        results.push({ id: lib.id, status: pass ? "PASS" : "FAIL", table, kahn, checkType, severity, violated, total, pct: +pct.toFixed(2), threshold });
    }

    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status === "FAIL").length;
    const na = results.filter((r) => r.status === "NA").length;
    const errored = results.filter((r) => r.status === "ERROR").length;
    return { schema, total: results.length, pass, fail, na, errored, results };
}
