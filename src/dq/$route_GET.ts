// GET /dq — Data-Quality dashboard. Renders the last `bun script/dq.ts` run
// (.hyper/_runtime/dq-results.json): the SQLQuery-Library DQ checks
// (mapspec/dqchecks/*, per HL7/sql-on-fhir#375) grouped by Kahn category,
// failures surfaced with violated/total bars.
export default async function (ctx: any, _session: any, req: Request) {
    const { esc, KAHN_COLOR: COLOR, statusBadge: badge } = await import("./ui");
    const { readdirSync } = await import("node:fs");
    // discover which schemas have a saved run
    const schemas = readdirSync(".hyper/_runtime").filter((f) => f.startsWith("dq-") && f.endsWith(".json") && f !== "dq-results.json").map((f) => f.slice(3, -5));
    const qp = new URL(req.url).searchParams;
    const want = qp.get("schema");
    const onlyFail = qp.get("only") === "fail";
    const file = want && schemas.includes(want) ? `dq-${want}.json` : "dq-results.json";
    let data: any;
    try { data = JSON.parse(await Bun.file(`.hyper/_runtime/${file}`).text()); }
    catch { return { title: "Data Quality", current: "dq", main: `<h1>Data Quality</h1><p>No run yet. Run <code>bun script/dq.ts [schema]</code> to populate the dashboard.</p>` }; }

    const switcher = schemas.length > 1
        ? `<div style="margin:8px 0">${schemas.map((s) => s === data.schema
            ? `<span style="font-size:12px;padding:3px 10px;border-radius:14px;background:#111827;color:#fff;margin-right:6px">${esc(s)}</span>`
            : `<a href="/dq?schema=${esc(s)}" style="font-size:12px;padding:3px 10px;border-radius:14px;background:#f3f4f6;color:#374151;margin-right:6px;text-decoration:none">${esc(s)}</a>`).join("")}</div>`
        : "";

    const results: any[] = data.results ?? [];
    const KAHN = ["conformance", "completeness", "plausibility"];

    const tile = (label: string, n: number, color: string) =>
        `<div style="flex:1;min-width:110px;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff">
           <div style="font-size:26px;font-weight:700;color:${color}">${n}</div>
           <div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">${label}</div></div>`;

    // per-category pass/fail
    const catRow = (k: string) => {
        const rs = results.filter((r) => r.kahn === k);
        const pass = rs.filter((r) => r.status === "PASS").length;
        const fail = rs.filter((r) => r.status === "FAIL").length;
        const total = pass + fail || 1;
        return `<div style="margin:6px 0">
          <div style="display:flex;justify-content:space-between;font-size:13px"><b style="text-transform:capitalize">${k}</b><span style="color:#6b7280">${pass}/${pass + fail} pass</span></div>
          <div style="height:8px;border-radius:4px;background:#fee2e2;overflow:hidden"><div style="height:100%;width:${(pass / total) * 100}%;background:${COLOR[k]}"></div></div></div>`;
    };

    // all checks, worst first: FAIL → ERROR → NA → PASS
    const ORDER: Record<string, number> = { FAIL: 0, ERROR: 1, NA: 2, PASS: 3 };
    const all = results.slice()
        .filter((r) => !onlyFail || r.status === "FAIL" || r.status === "ERROR")
        .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (b.pct ?? 0) - (a.pct ?? 0));
    const q = `?schema=${esc(data.schema)}`;
    const checkRow = (r: any) => {
        const pct = r.pct ?? 0;
        const bar = (r.status === "FAIL" || r.status === "PASS") && r.total
            ? `<div style="height:6px;width:100px;border-radius:3px;background:#f3f4f6;display:inline-block;vertical-align:middle;overflow:hidden">
                 <div style="height:100%;width:${Math.min(100, pct)}%;background:${r.status === "FAIL" ? (r.severity === "error" ? "#dc2626" : "#d97706") : "#16a34a"}"></div></div>` : "";
        const detail = r.status === "ERROR" ? `<span style="color:#b91c1c">${esc(r.reason)}</span>`
            : r.status === "NA" ? `<span style="color:#9ca3af">${esc(r.reason)}</span>`
            : `${bar} <b>${pct}%</b> <span style="color:#6b7280">(${r.violated}/${r.total}, thr ${r.threshold}%)</span>`;
        return `<tr data-pass="${r.status === "PASS" ? "1" : "0"}" style="background:${r.status === "FAIL" ? "#fef2f2" : "transparent"}">
          <td style="white-space:nowrap;width:70px">${badge(r.status)}</td>
          <td style="font-family:monospace;font-size:12px"><a href="/dq/${esc(r.id)}?schema=${esc(data.schema)}" style="color:#2563eb;text-decoration:none">${esc(r.id)}</a></td>
          <td style="white-space:nowrap">${detail}</td></tr>`;
    };

    const main = `
    <h1 style="margin-bottom:2px">Data Quality Dashboard</h1>
    <p style="color:#6b7280;margin-top:0;font-size:13px">schema <code>${esc(data.schema)}</code> · ${esc((data.ranAt || "").slice(0, 19).replace("T", " "))} · SQLQuery-Library checks (sql-on-fhir#375)</p>
    ${switcher}

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
      ${tile("Pass", data.pass, "#16a34a")}
      ${tile("Fail", data.fail, "#dc2626")}
      ${tile("Error", data.errored, "#b91c1c")}
      ${tile("N/A", data.na, "#9ca3af")}
      ${tile("Total", data.total, "#111827")}
    </div>

    <div style="max-width:520px;margin:14px 0">${KAHN.map(catRow).join("")}</div>

    <style>#dq-showpass:not(:checked) ~ .dqwrap tr[data-pass="1"]{display:none}
      .dqwrap table{border-collapse:collapse;width:100%} .dqwrap td{padding:4px 8px}
      .dqcat{margin:18px 0 4px;font-size:15px} .dqtbl{margin:10px 0 2px;font-size:12px;font-weight:700;color:#374151;font-family:monospace}</style>
    <div style="margin:8px 0;display:flex;gap:14px;align-items:center">
      <span style="display:inline-flex;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:12px">
        <a href="/dq${q}" style="padding:4px 12px;text-decoration:none;background:${onlyFail ? "#fff" : "#111827"};color:${onlyFail ? "#374151" : "#fff"}">All (${results.length})</a>
        <a href="/dq${q}&only=fail" style="padding:4px 12px;text-decoration:none;background:${onlyFail ? "#dc2626" : "#fff"};color:${onlyFail ? "#fff" : "#374151"};border-left:1px solid #e5e7eb">Failing (${results.filter((r) => r.status === "FAIL" || r.status === "ERROR").length})</a>
      </span>
      ${onlyFail ? "" : `<span><input type="checkbox" id="dq-showpass" style="vertical-align:middle"><label for="dq-showpass" style="font-size:13px;color:#374151;cursor:pointer"> show passing (${results.filter((r) => r.status === "PASS").length})</label></span>`}
    </div>
    <div class="dqwrap">
    ${KAHN.map((k) => {
        const inCat = all.filter((r) => r.kahn === k);
        if (!inCat.length) return "";
        const p = inCat.filter((r) => r.status === "PASS").length, f = inCat.filter((r) => r.status === "FAIL").length;
        const byTable = [...new Set(inCat.map((r) => r.table))].sort();
        return `<h2 class="dqcat"><span style="color:${COLOR[k]};text-transform:capitalize">${k}</span>
            <span style="font-size:12px;color:#6b7280;font-weight:400">— ${p} pass${f ? `, <b style="color:#dc2626">${f} fail</b>` : ""}, ${inCat.length} total</span></h2>
          ${byTable.map((t) => {
            const rows = inCat.filter((r) => r.table === t);
            return `<div class="dqtbl">${esc(t)} <span style="color:#9ca3af;font-weight:400">(${rows.filter((r) => r.status === "PASS").length}/${rows.length})</span></div>
              <table><tbody>${rows.map(checkRow).join("")}</tbody></table>`;
        }).join("")}`;
    }).join("")}
    ${all.length ? "" : `<p style="color:#16a34a;margin-top:12px">No failing checks. 🎉</p>`}
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:16px">Refresh: <code>bun script/dq.ts ${esc(data.schema)}</code></p>`;

    return { title: "Data Quality", current: "dq", main };
}
