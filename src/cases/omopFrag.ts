// HTML fragments for the structured expected-OMOP editor. You pick a table, then
// htmx loads a form with ALL that table's columns — the column NAME is a fixed
// label (required ones marked *), and you only fill the VALUE. A *_concept_id
// column also gets a companion "name" input (→ <col>__name, display only).
// Shared by renderEditor (prefill existing rows) and GET /cases/frag/omop.
//
//   ctx.fns.cases.omopFrag(ctx, { kind: "table"|"row", table, rows? })
function esc(s: any) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fieldRow(table: string, fields: any[], rowObj?: Record<string, any>): string {
    const cells = fields.map((f) => {
        const name: string = f.name;
        const val = rowObj?.[name] ?? "";
        const req = f.required ? `<span class="text-rose-500" title="required">*</span>` : "";
        const isConcept = name.endsWith("_concept_id");
        const isRefFk = f.isForeignKey && f.fkTable && f.fkTable !== "CONCEPT";
        const ph = isRefFk ? "ref:<id>" : isConcept ? "concept_id" : esc(f.type ?? "");
        const valInput = `<input data-col="${esc(name)}" value="${esc(val)}" placeholder="${esc(ph)}" class="font-mono text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-full outline-none focus:border-violet-400">`;
        const nameInput = isConcept
            ? `<input data-name-for="${esc(name)}" value="${esc(rowObj?.[name + "__name"] ?? "")}" placeholder="concept name" class="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-40 outline-none focus:border-emerald-400 text-gray-600">`
            : "";
        return `<label class="text-[11px] font-mono text-gray-500 self-center justify-self-end pr-1 ${f.required ? "text-gray-700" : ""}">${esc(name)}${req}</label>
    <div class="flex items-center gap-1">${valInput}${nameInput}</div>`;
    }).join("\n    ");
    return `<div class="orow border border-gray-200 rounded p-2 mb-1.5 bg-white">
  <div class="grid grid-cols-[minmax(120px,200px)_1fr] gap-x-2 gap-y-1 items-center">
    ${cells}
  </div>
  <div class="mt-1.5 text-right"><button type="button" onclick="rm(this,'.orow')" class="text-[11px] text-rose-500 hover:underline">remove row</button></div>
</div>`;
}

function tableBlock(table: string, fields: any[], rows?: any[]): string {
    const rowsHtml = rows && rows.length ? rows.map((r) => fieldRow(table, fields, r)).join("") : fieldRow(table, fields);
    return `<div class="omop-table border border-violet-200 rounded-lg mb-2" data-table="${esc(table)}">
  <div class="flex items-center justify-between px-3 py-1.5 bg-violet-50 border-b border-violet-100">
    <span class="font-mono text-[12px] font-semibold text-violet-800">${esc(table)}</span>
    <button type="button" onclick="rm(this,'.omop-table')" class="text-[11px] text-rose-500 hover:underline">remove table</button>
  </div>
  <div class="p-2">
    <div class="orows">${rowsHtml}</div>
    <button type="button" hx-get="/cases/frag/omop?kind=row&table=${esc(table)}" hx-target="previous .orows" hx-swap="beforeend" class="text-[11px] text-violet-600 hover:underline">+ row</button>
  </div>
</div>`;
}

export default async function (ctx: Context, opts: { kind: "table" | "row"; table: string; rows?: any[] }): Promise<string> {
    const t = String(opts.table ?? "").trim();
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) return `<!-- bad table -->`;
    const fields = (await ctx.fns.omop.byTable(ctx, { name: t })).filter((f: any) => !f.isPrimaryKey);
    if (!fields.length) return `<!-- unknown table ${esc(t)} -->`;
    if (opts.kind === "row") return fieldRow(t, fields);
    return tableBlock(t, fields, opts.rows);
}
