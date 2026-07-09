// GET /dq/:id — drill into a single DQ check: its SQLQuery-Library resource
// (SQL, Kahn category, threshold), the current result, and a sample of the
// actual FAILING rows from the last-run schema.
export default async function (ctx: any, _session: any, req: Request) {
    const id = (req as any).params.id as string;
    const { esc, KAHN_COLOR: COLOR } = await import("./ui");

    let lib: any;
    try { lib = JSON.parse(await Bun.file(`mapspec/dqchecks/${id}.sqlquery.json`).text()); }
    catch { return new Response("Not Found", { status: 404 }); }

    const ext = (u: string) => lib.extension?.find((e: any) => e.url.endsWith(u));
    const kahn = ext("dq-kahn-category")?.valueCode;
    const checkType = ext("dq-check-type")?.valueString;
    const threshold = ext("dq-threshold-pct")?.valueDecimal ?? 0;
    const severity = ext("dq-severity")?.valueCode;
    const table = lib.parameter?.find((p: any) => p.name === "cdmTable")?.valueString;
    let sql = lib.content?.[0]?.data as string;

    // schema: ?schema= wins, else the last dashboard run
    let schema = new URL(req.url).searchParams.get("schema") ?? "";
    if (!schema) { try { schema = JSON.parse(await Bun.file(".hyper/_runtime/dq-results.json").text()).schema; } catch {} }
    if (!schema) schema = "cdm_ours_fhir";
    if (schema !== "cdm_ours_fhir") sql = sql.replaceAll("cdm_ours_fhir.", `${schema}.`);

    let total = 0, violated = 0, rows: any[] = [], cols: string[] = [], err = "";
    try {
        total = (await ctx.fns.db.query(ctx, { sql: `SELECT count(*)::int n FROM ${schema}.${table}` }))[0]?.n ?? 0;
        violated = (await ctx.fns.db.query(ctx, { sql: `SELECT count(*)::int n FROM (${sql}) q` }))[0]?.n ?? 0;
        rows = await ctx.fns.db.query(ctx, { sql: `SELECT * FROM (${sql}) q LIMIT 50` });
        cols = rows.length ? Object.keys(rows[0]) : [];
    } catch (e: any) { err = e.message?.split("\n")[0] ?? String(e); }

    const pct = total ? +((violated / total) * 100).toFixed(2) : 0;
    const pass = pct <= threshold;

    const rowsTable = rows.length
        ? `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;font-family:monospace">
             <thead><tr>${cols.map((c) => `<th style="text-align:left;padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${esc(c)}</th>`).join("")}</tr></thead>
             <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td style="padding:3px 8px;border-bottom:1px solid #f3f4f6">${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
        : `<p style="color:#16a34a">No failing rows.</p>`;

    const main = `
    <p style="margin-bottom:4px"><a href="/dq" style="color:#6b7280;text-decoration:none">← Data Quality</a></p>
    <h1 style="margin:2px 0;font-family:monospace;font-size:20px">${esc(id)}</h1>
    <p style="margin-top:0">
      <span style="font-size:11px;padding:2px 8px;border-radius:9px;color:#fff;background:${COLOR[kahn] ?? "#6b7280"}">${esc(kahn)}</span>
      <span style="font-size:11px;padding:2px 8px;border-radius:9px;background:#f3f4f6;color:#374151">${esc(checkType)}</span>
      <span style="font-size:11px;padding:2px 8px;border-radius:9px;background:${severity === "error" ? "#fee2e2" : "#fef3c7"};color:#374151">${esc(severity)}</span>
    </p>
    <p style="font-size:14px;color:#374151">${esc(lib.title)}</p>

    <div style="display:inline-block;padding:12px 16px;border:1px solid ${pass ? "#bbf7d0" : "#fecaca"};border-radius:10px;background:${pass ? "#f0fdf4" : "#fef2f2"};margin:8px 0">
      <b style="font-size:20px;color:${pass ? "#16a34a" : "#dc2626"}">${pass ? "PASS" : "FAIL"}</b>
      &nbsp; ${err ? `<span style="color:#b91c1c">${esc(err)}</span>` : `${violated} / ${total} rows &nbsp; <b>${pct}%</b> <span style="color:#6b7280">(threshold ${threshold}%)</span>`}
    </div>

    <h3 style="margin-top:18px">SQLQuery (returns failing rows)</h3>
    ${await ctx.fns.markdown.highlight(ctx, { code: sql, lang: "sql" })}

    <h3 style="margin-top:18px">Failing rows${rows.length >= 50 ? " (first 50)" : rows.length ? ` (${rows.length})` : ""}</h3>
    ${rowsTable}
    <p style="color:#9ca3af;font-size:12px;margin-top:14px">schema <code>${esc(schema)}</code> · resource <code>mapspec/dqchecks/${esc(id)}.sqlquery.json</code></p>`;

    return { title: `DQ · ${id}`, current: "dq", main };
}
