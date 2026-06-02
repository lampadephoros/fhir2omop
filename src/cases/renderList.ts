// Render the /cases index as a simple list, grouped by FHIR resource: a bold
// resource header, then one row per branch — title + a short summary (from the
// file's notes), with a pass/fail check on the right. No cards, no underlines.
export default function (ctx: Context, opts: { cases: any[] }): string {
    const { cases } = opts;

    if (!cases.length) {
        return `<h1>Test cases</h1>
<p class="text-gray-500">No cases found in <code>cases/*.json</code>.</p>`;
    }

    const check = (c: any): string => {
        if (c.status === "pass") return `<span class="text-emerald-600 text-sm font-semibold whitespace-nowrap" title="pass">✓ ${c.passCount}/${c.ranCount}</span>`;
        if (c.status === "fail") return `<span class="text-rose-600 text-sm font-semibold whitespace-nowrap" title="fail">✗ ${c.passCount}/${c.ranCount}</span>`;
        return `<span class="text-gray-300 text-sm" title="not run">○</span>`;
    };

    // Primary FHIR resource of a branch — the slug's first segment, cased to the
    // matching resourceType from the file's fhirTypes.
    const resourceOf = (c: any): string => {
        const part0 = (c.slug?.split("--")[0] ?? "");
        return (c.fhirTypes ?? []).find((t: string) => t.toLowerCase() === part0) ?? part0;
    };

    const row = (c: any): string => {
        const err = c.error ? `<span class="ml-2 text-[11px] text-rose-600">parse error</span>` : "";
        const summary = summarize(c.notes) || (c.omopTables ?? []).join(", ") || "";
        return `<a href="/cases/${enc(c.slug)}" class="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50 border-t border-gray-100 first:border-t-0">
  <div class="min-w-0 flex-1">
    <div class="text-[13px] text-gray-800 leading-snug">${esc(c.title)}${err}</div>
    ${summary ? `<div class="text-[11px] text-gray-500 leading-snug line-clamp-1">${esc(summary)}</div>` : ""}
  </div>
  ${check(c)}
</a>`;
    };

    // Group by resource, preserving the (slug-sorted) order so each resource's
    // files are already contiguous.
    const order: string[] = [];
    const groups = new Map<string, any[]>();
    for (const c of cases) {
        const r = resourceOf(c);
        if (!groups.has(r)) { groups.set(r, []); order.push(r); }
        groups.get(r)!.push(c);
    }
    const sections = order.map((r) => {
        const items = groups.get(r)!;
        return `<div class="mb-5">
  <div class="not-prose text-[13px] font-semibold text-gray-800 mb-1.5">${esc(r)} <span class="text-gray-400 font-normal">· ${items.length} branch${items.length === 1 ? "" : "es"}</span></div>
  <div class="not-prose border border-gray-200 rounded-lg overflow-hidden">${items.map(row).join("")}</div>
</div>`;
    }).join("");

    const totalVariants = cases.reduce((n, c) => n + (c.variantCount ?? 0), 0);
    const ran = cases.filter((c) => c.status !== "unrun");
    const totPass = cases.reduce((n, c) => n + (c.passCount ?? 0), 0);
    const totRan = cases.reduce((n, c) => n + (c.ranCount ?? 0), 0);
    const runLine = ran.length === 0
        ? `Not run yet — <code>bun script/run-cases.ts</code> to execute against the real pipeline.`
        : `Last run: <strong class="${totPass === totRan ? "text-emerald-700" : "text-rose-700"}">${totPass}/${totRan} green</strong>${cases[0]?.ranAt ? ` · ${esc(String(cases[0].ranAt).slice(0, 19).replace("T", " "))}` : ""}.`;
    return `<div class="not-prose flex items-center justify-between gap-3"><h1 class="!mb-0">Test cases</h1>
  <a href="/cases/new" class="shrink-0 px-3 py-1.5 rounded bg-sky-600 text-white text-[13px] font-medium hover:bg-sky-700">+ New case</a></div>
<p class="text-gray-600">Golden FHIR&nbsp;→&nbsp;OMOP fixtures, organized by source resource then implementation branch. <strong>${cases.length}</strong> branches across <strong>${order.length}</strong> resources, <strong>${totalVariants}</strong> variants. ${runLine}</p>
<div class="mt-4">${sections}</div>`;
}

// One-line plain-text summary from a branch's (markdown) notes: strip light
// markdown, take the first sentence, cap the length.
function summarize(notes: string): string {
    if (!notes) return "";
    let s = String(notes)
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*?([^*]+)\*\*?/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const m = s.match(/^(.{0,150}?[.!?])(\s|$)/);
    if (m) return m[1]!;
    return s.length > 150 ? s.slice(0, 150).replace(/\s+\S*$/, "") + "…" : s;
}

function esc(s: string) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function enc(s: string) { return encodeURIComponent(s); }
