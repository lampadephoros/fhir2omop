// HTML fragments for the structured expected-OMOP editor. Shared by renderEditor
// (server-side prefill of existing rows) and the htmx endpoint /cases/frag/omop
// (blank table / row / cell on demand). Column autocomplete comes from a per-table
// <datalist id="oc--<table>"> rendered once by renderEditor (we know the columns).
//
//   ctx.fns.cases.omopFrag(ctx, { kind: "table"|"row"|"cell", table, rows? })
function esc(s: any) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function cell(table: string, col = "", val = ""): string {
    return `<div class="ocell flex items-center gap-1 mb-1">
  <input data-col list="oc--${esc(table)}" value="${esc(col)}" placeholder="column" class="font-mono text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-52 outline-none focus:border-violet-400">
  <span class="text-gray-300 text-xs">=</span>
  <input data-val value="${esc(val)}" placeholder="value (number, text, ref:id, …)" class="font-mono text-[11px] border border-gray-200 rounded px-1.5 py-0.5 flex-1 min-w-0 outline-none focus:border-violet-400">
  <button type="button" onclick="rm(this,'.ocell')" class="text-rose-400 hover:text-rose-600 text-sm leading-none px-1">×</button>
</div>`;
}

function row(table: string, rowObj?: Record<string, any>): string {
    const keys = rowObj ? Object.keys(rowObj) : [];
    const cells = keys.length ? keys.map((k) => cell(table, k, rowObj![k])).join("") : cell(table);
    return `<div class="orow border border-gray-200 rounded p-2 mb-1.5 bg-white">
  <div class="cells">${cells}</div>
  <div class="flex gap-3 mt-1">
    <button type="button" hx-get="/cases/frag/omop?kind=cell&table=${esc(table)}" hx-target="previous .cells" hx-swap="beforeend" class="text-[11px] text-violet-600 hover:underline">+ field</button>
    <button type="button" onclick="rm(this,'.orow')" class="text-[11px] text-rose-500 hover:underline">remove row</button>
  </div>
</div>`;
}

function table(t: string, rows?: any[]): string {
    const rowsHtml = rows && rows.length ? rows.map((r) => row(t, r)).join("") : row(t);
    return `<div class="omop-table border border-violet-200 rounded-lg mb-2" data-table="${esc(t)}">
  <div class="flex items-center justify-between px-3 py-1.5 bg-violet-50 border-b border-violet-100">
    <span class="font-mono text-[12px] font-semibold text-violet-800">${esc(t)}</span>
    <button type="button" onclick="rm(this,'.omop-table')" class="text-[11px] text-rose-500 hover:underline">remove table</button>
  </div>
  <div class="p-2">
    <div class="orows">${rowsHtml}</div>
    <button type="button" hx-get="/cases/frag/omop?kind=row&table=${esc(t)}" hx-target="previous .orows" hx-swap="beforeend" class="text-[11px] text-violet-600 hover:underline">+ row</button>
  </div>
</div>`;
}

export default async function (ctx: Context, opts: { kind: "table" | "row" | "cell"; table: string; rows?: any[] }): Promise<string> {
    const t = String(opts.table ?? "").trim();
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) return `<!-- bad table -->`;
    if (opts.kind === "cell") return cell(t);
    if (opts.kind === "row") return row(t);
    return table(t, opts.rows);
}
