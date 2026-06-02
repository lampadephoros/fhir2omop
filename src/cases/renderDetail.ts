// Render one branch file: title + notes, then each variant case as a
// collapsible section — FHIR input (highlighted JSON) beside the expected
// OMOP rows (concept-aware cards), grouped by table.
export default async function (ctx: Context, opts: { case: any }): Promise<string> {
    const file = opts.case;
    const flow = renderFlow(file.fhirTypes, file.omopTables);
    const notesHtml = file.notes ? await ctx.fns.markdown.render(ctx, { source: file.notes }) : "";

    // One highlighted YAML card per FHIR resource (shared by fixtures + variants).
    const fhirCard = async (r: any) => {
        const head = `${r.resourceType ?? "?"}${r.id ? ` <span class="font-mono text-sky-700">#${esc(r.id)}</span>` : ""}`;
        const hl = await ctx.fns.markdown.render(ctx, { source: "```yaml\n" + Bun.YAML.stringify(r, null, 2) + "\n```" });
        return `<div class="border border-gray-200 rounded-lg overflow-hidden">
  <div class="px-3 py-1.5 bg-sky-50 border-b border-gray-200 text-xs font-semibold text-sky-900">${head}</div>
  <div class="px-1">${hl}</div>
</div>`;
    };

    const fixtures = file.fixtures ?? [];
    const fixturesHtml = fixtures.length
        ? ctx.fns.ui_components.collapsiblePanel(ctx, {
            open: false, tone: "emerald", key: `fixtures-${esc(file.slug)}`, class: "mb-4",
            summary: `<span class="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Shared fixtures (${fixtures.length}) — merged into every variant</span>`,
            body: (await Promise.all(fixtures.map(fhirCard))).join(""),
            bodyClass: "p-3 grid sm:grid-cols-2 gap-3",
        })
        : "";

    const variants = await Promise.all((file.cases ?? []).map(async (v: any, i: number) => {
        const fhirCards = await Promise.all((v.fhir ?? []).map(fhirCard));

        // Expected OMOP — grouped by table.
        const tables = Object.keys(v.omopByTable ?? {});
        const totalRows = tables.reduce((n, t) => n + (v.omopByTable[t]?.length ?? 0), 0);
        let omopHtml: string;
        if (totalRows === 0) {
            omopHtml = `<div class="border border-rose-200 bg-rose-50 rounded-lg p-3 text-rose-800">
  <div class="font-semibold text-sm">Expected: no rows</div>
  <div class="text-xs mt-0.5">The pipeline must emit <strong>zero</strong> OMOP rows for this input.</div>
</div>`;
        } else {
            omopHtml = tables.map((t) => {
                const rows = v.omopByTable[t] ?? [];
                const rowCards = rows.map((row: any, k: number) =>
                    renderRow(row, rows.length > 1 ? k + 1 : null)).join("");
                return `<div>
  <div class="flex items-center gap-2 mb-1.5">
    <span class="px-2 py-0.5 rounded font-mono text-xs bg-violet-100 text-violet-800">${esc(t)}</span>
    <span class="text-xs text-gray-400">${rows.length} row${rows.length === 1 ? "" : "s"}</span>
  </div>
  <div class="space-y-2">${rowCards}</div>
</div>`;
            }).join('<div class="h-3"></div>');
        }

        const res = v.result;
        // status as a compact mark pinned top-right (no per-case flow — that's
        // the bold subgroup header now).
        const corner = !res
            ? `<span class="text-gray-300 text-base" title="not run">○</span>`
            : res.pass
                ? `<span class="text-emerald-600 text-base font-semibold" title="pass">✓</span>`
                : `<span class="text-rose-600 text-base font-semibold" title="fail">✗</span>`;
        const failBlock = res && !res.pass && res.failures?.length
            ? `<div class="not-prose mb-3 border border-rose-200 bg-rose-50 rounded-lg p-3">
    <div class="text-xs font-semibold text-rose-800 mb-1">Assertion failures</div>
    <ul class="text-[12px] text-rose-700 font-mono space-y-0.5">${res.failures.map((x: string) => `<li>${esc(x)}</li>`).join("")}</ul>
  </div>` : "";
        const tone = res ? (res.pass ? "emerald" : "rose") : "gray";
        const body = `${v.desc ? `<div class="not-prose text-[13px] text-gray-600 leading-relaxed mb-3">${esc(v.desc)}</div>` : ""}
  ${failBlock}
  <div class="not-prose grid lg:grid-cols-2 gap-5">
    <div>
      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">FHIR input${fixtures.length ? ` <span class="text-emerald-600 normal-case">+ ${fixtures.length} shared fixture${fixtures.length === 1 ? "" : "s"}</span>` : ""}</div>
      <div class="space-y-3">${fhirCards.join("") || '<div class="text-xs text-gray-400 italic px-1">(only shared fixtures)</div>'}</div>
    </div>
    <div>
      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Expected OMOP</div>
      ${omopHtml}
    </div>
  </div>`;
        const html = ctx.fns.ui_components.collapsiblePanel(ctx, {
            open: false, tone, key: `case-${esc(file.slug)}-${i}`, class: "",
            summary: `<div class="text-[13px] text-gray-800 leading-snug">${esc(v.desc ?? `variant ${i + 1}`)}</div>`,
            corner,
            body,
        });
        return { tables: (v.omopTables ?? []) as string[], html };
    }));

    // Group variants by the OMOP table(s) they target; the Resource → table flow
    // becomes a bold subgroup header (shown only when a file fans out to >1
    // target) instead of being repeated on every case.
    const part0 = file.slug.split("--")[0] ?? "";
    const primaryResource = (file.fhirTypes ?? []).find((t: string) => t.toLowerCase() === part0) ?? part0;
    const groupKey = (tables: string[]) => tables.slice().sort().join(", ") || "∅";
    const order: string[] = [];
    const groups = new Map<string, { tables: string[]; items: string[] }>();
    for (const b of variants) {
        const k = groupKey(b.tables);
        if (!groups.has(k)) { groups.set(k, { tables: b.tables, items: [] }); order.push(k); }
        groups.get(k)!.items.push(b.html);
    }
    const multiGroup = groups.size > 1;
    const variantsHtml = order.map((k) => {
        const g = groups.get(k)!;
        const tablesHtml = g.tables.length
            ? g.tables.map((t) => `<span class="font-mono">${esc(t)}</span>`).join('<span class="text-gray-300 font-normal px-0.5">·</span>')
            : '<span class="text-gray-400 font-normal italic">no rows</span>';
        const header = multiGroup
            ? `<div class="not-prose mt-5 mb-2 text-[13px] font-semibold text-gray-800 flex items-center flex-wrap gap-1.5"><span>${esc(primaryResource)}</span><span class="text-gray-400 font-normal">→</span>${tablesHtml}</div>`
            : "";
        return `${header}<div class="not-prose space-y-3">${g.items.join("")}</div>`;
    }).join("");

    const notesPanel = notesHtml
        ? ctx.fns.ui_components.collapsiblePanel(ctx, {
            open: false, tone: "gray", key: `notes-${esc(file.slug)}`, class: "mb-4",
            summary: `<span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</span>`,
            body: notesHtml, bodyClass: "prose prose-sm max-w-none p-3",
        })
        : "";

    // Variants are collapsed by default — expand/collapse-all toggles every
    // case panel on this page (scoped to data-k="case-…").
    const toggleAll = (open: boolean) =>
        `document.querySelectorAll('details[data-k^=&quot;case-${esc(file.slug)}-&quot;]').forEach(function(d){d.open=${open}})`;
    const controls = (file.cases ?? []).length > 1
        ? `<div class="not-prose flex items-center gap-2 mb-3">
    <p class="text-[11px] text-gray-400 flex-1">FK ids shown as <span class="font-mono">ref:&lt;logical-id&gt;</span>. Columns not listed ⇒ <span class="font-mono">NULL</span>; tables not listed ⇒ empty.</p>
    <button type="button" onclick="${toggleAll(true)}" class="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Expand all</button>
    <button type="button" onclick="${toggleAll(false)}" class="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Collapse all</button>
  </div>`
        : `<p class="not-prose text-[11px] text-gray-400 mb-3">FK ids shown as <span class="font-mono">ref:&lt;logical-id&gt;</span>. Per row, columns not listed are asserted <span class="font-mono">NULL</span>; tables not listed are asserted empty.</p>`;

    // Read mode is the default; Edit navigates to /cases/:slug/edit (classic
    // web-2.0 page, swapped in via hx-boost).
    return `<div class="not-prose flex items-center justify-between gap-3"><h1 class="!mb-0">${esc(file.title)}</h1>
  <a href="/cases/${enc(file.slug)}/edit" class="shrink-0 px-3 py-1.5 rounded border border-sky-300 text-sky-700 text-[13px] font-medium hover:bg-sky-50">Edit</a></div>
<div class="mt-1 mb-1">${flow}</div>
<p class="font-mono text-[11px] text-gray-400 -mt-1">cases/${esc(file.file)} · ${file.variantCount} variant${file.variantCount === 1 ? "" : "s"}</p>
${notesPanel}
${fixturesHtml}
${controls}
${variantsHtml}`;
}

// One expected OMOP row as a key/value card.
function renderRow(row: any, n: number | null): string {
    const keys = Object.keys(row).filter((k) => !k.endsWith("__name"));
    const lines = keys.map((k) => {
        const v = row[k];
        const name = row[`${k}__name`];
        return `<div class="contents">
  <dt class="font-mono text-[12px] text-gray-500 py-1 pr-3 align-top">${esc(k)}</dt>
  <dd class="py-1">${renderValue(v, name)}</dd>
</div>`;
    }).join("");
    const num = n ? `<div class="text-[11px] font-semibold text-gray-400 mb-1">#${n}</div>` : "";
    return `<div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
  ${num}
  <dl class="grid grid-cols-[max-content_1fr] gap-x-1 text-[13px]">${lines}</dl>
</div>`;
}

function renderValue(v: any, name?: string): string {
    if (v === null || v === undefined) return `<span class="text-gray-400 italic">null</span>`;
    if (typeof v === "string" && v.startsWith("ref:")) {
        return `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[12px]">${esc(v)}</span>`;
    }
    if (name !== undefined && name !== null) {
        return `<span class="font-mono text-[12px] text-gray-800">${esc(String(v))}</span>
  <span class="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[12px]">${esc(String(name))}</span>`;
    }
    if (typeof v === "number") return `<span class="font-mono text-[12px] text-indigo-700">${esc(String(v))}</span>`;
    if (typeof v === "boolean") return `<span class="font-mono text-[12px] text-indigo-700">${v}</span>`;
    return `<span class="text-gray-800">${esc(String(v))}</span>`;
}

function renderFlow(fhirTypes: string[], omopTables: string[]): string {
    const fhir = (fhirTypes ?? []).map((t) =>
        `<span class="px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-100 text-sky-800">${esc(t)}</span>`).join(" ");
    const omop = (omopTables ?? []).length
        ? omopTables.map((t) =>
            `<span class="px-1.5 py-0.5 rounded text-[11px] font-mono bg-violet-100 text-violet-800">${esc(t)}</span>`).join(" ")
        : `<span class="text-xs text-gray-400 italic">∅</span>`;
    return `<div class="not-prose flex items-center flex-wrap gap-1.5">${fhir}<span class="text-gray-400 px-1">→</span>${omop}</div>`;
}

function esc(s: string) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function enc(s: string) { return encodeURIComponent(s); }
