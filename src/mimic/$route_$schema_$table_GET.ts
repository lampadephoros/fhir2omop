// GET /mimic/:schema/:table — column list + paginated sample rows for one
// MIMIC table. Identifiers are whitelisted against information_schema (and a
// mimic_% prefix), never interpolated from raw user input.

const IDENT = /^[a-z_][a-z0-9_]*$/;
const CELL_MAX = 300;

export default async function (ctx: Context, _session: any, req: Request) {
    const params = (req as any).params as { schema: string; table: string };
    const { schema, table } = params;
    if (!IDENT.test(schema) || !IDENT.test(table) || !schema.startsWith("mimic")) {
        return new Response("Not Found", { status: 404 });
    }
    const exists = await ctx.fns.db.query(ctx, {
        sql: `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        params: [schema, table],
    });
    if (!exists.length) return new Response("Not Found", { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "25", 10) || 25, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    const cols: { column_name: string; data_type: string; is_nullable: string }[] =
        await ctx.fns.db.query(ctx, {
            sql: `SELECT column_name, data_type, is_nullable
                  FROM information_schema.columns
                  WHERE table_schema = $1 AND table_name = $2
                  ORDER BY ordinal_position`,
            params: [schema, table],
        });
    const [{ n: total }] = await ctx.fns.db.query(ctx, {
        sql: `SELECT count(*)::int AS n FROM "${schema}"."${table}"`,
    });
    const rows: Record<string, any>[] = await ctx.fns.db.query(ctx, {
        sql: `SELECT * FROM "${schema}"."${table}" LIMIT ${limit} OFFSET ${offset}`,
    });

    const colsHtml = cols.map((c) => `<tr class="border-b border-gray-100">
  <td class="px-2 py-1 font-mono text-xs text-gray-800">${esc(c.column_name)}</td>
  <td class="px-2 py-1 font-mono text-xs text-gray-500">${esc(c.data_type)}</td>
  <td class="px-2 py-1 text-xs text-gray-400">${c.is_nullable === "YES" ? "" : "not null"}</td>
</tr>`).join("\n");

    const names = cols.map((c) => c.column_name);
    const head = names.map((n) => `<th class="px-2 py-1.5 font-medium whitespace-nowrap">${esc(n)}</th>`).join("");
    const body = rows.map((r) => `<tr class="border-b border-gray-100 hover:bg-gray-50 align-top">${
        names.map((n) => `<td class="px-2 py-1 font-mono text-[11px] text-gray-700 whitespace-pre-wrap break-all max-w-md">${cell(r[n])}</td>`).join("")
    }</tr>`).join("\n");

    const prev = offset > 0
        ? `<a href="?limit=${limit}&offset=${Math.max(offset - limit, 0)}" class="text-blue-600 hover:underline">← prev</a>`
        : `<span class="text-gray-300">← prev</span>`;
    const next = offset + limit < total
        ? `<a href="?limit=${limit}&offset=${offset + limit}" class="text-blue-600 hover:underline">next →</a>`
        : `<span class="text-gray-300">next →</span>`;

    const main = `<div class="not-prose">
  <div class="mb-4">
    <div class="text-xs text-gray-400"><a href="/mimic" class="text-blue-600 hover:underline">mimic</a> / ${esc(schema)}</div>
    <h1 class="text-2xl font-bold text-gray-900 font-mono">${esc(schema)}.${esc(table)}</h1>
    <div class="text-sm text-gray-500 mt-1">${total.toLocaleString("en-US")} rows · ${cols.length} columns</div>
  </div>

  <details class="mb-4">
    <summary class="cursor-pointer text-sm font-semibold text-gray-700">Columns (${cols.length})</summary>
    <table class="mt-2 text-left border border-gray-200 rounded max-w-xl">
      <thead><tr class="bg-gray-50 text-xs text-gray-500">
        <th class="px-2 py-1.5 font-medium">column</th>
        <th class="px-2 py-1.5 font-medium">type</th>
        <th class="px-2 py-1.5 font-medium"></th>
      </tr></thead>
      <tbody>${colsHtml}</tbody>
    </table>
  </details>

  <div class="flex items-center gap-3 text-sm mb-2">
    ${prev}
    <span class="text-gray-500">rows ${total === 0 ? 0 : offset + 1}–${Math.min(offset + limit, total)} of ${total.toLocaleString("en-US")}</span>
    ${next}
  </div>
  <div class="overflow-x-auto border border-gray-200 rounded">
    <table class="text-left min-w-full">
      <thead><tr class="bg-gray-50 text-xs text-gray-500">${head}</tr></thead>
      <tbody>${body || `<tr><td class="px-2 py-4 text-sm text-gray-400 italic">empty table</td></tr>`}</tbody>
    </table>
  </div>
</div>`;

    return { title: `${schema}.${table}`, current: "mimic", main };
}

function cell(v: any): string {
    if (v === null || v === undefined) return `<span class="text-gray-300">∅</span>`;
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    const cut = s.length > CELL_MAX;
    if (cut) s = s.slice(0, CELL_MAX);
    return esc(s) + (cut ? `<span class="text-gray-400">…</span>` : "");
}

function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
