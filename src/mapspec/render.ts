import { resolve } from "node:path";
// No cross-imports between project files (CLAUDE.md). Edges go through
// ctx.fns.mapspec.* — late-bound, hot-reloadable via REPL.
type Edge = any;

export default async function (
    ctx: Context,
    opts: { resource?: string; table?: string; table_only?: string },
): Promise<{ html: string; title: string } | null> {
    // Table-only mode: list of FHIR sources for an OMOP table
    if (opts.table_only) {
        const safeTable = sanitize(opts.table_only);
        if (!safeTable) return null;
        const edges = ctx.fns.mapspec.loadEdges(ctx);
        const byT = ctx.fns.mapspec.byTable(ctx, { edges });
        const sources = byT.get(safeTable) ?? [];
        if (sources.length === 0) return null;
        return {
            html: renderTablePage(safeTable, sources),
            title: safeTable,
        };
    }

    const safeRes = sanitize(opts.resource);
    if (!safeRes) return null;

    // Resource + table: edge detail page
    if (opts.table) {
        const safeTable = sanitize(opts.table);
        if (!safeTable) return null;

        const edge = ctx.fns.mapspec.loadEdges(ctx).find(
            (e: any) => e.fhir_resource === safeRes && e.omop_table === safeTable,
        );
        if (edge) {
            return {
                html: await renderEdge(ctx, edge),
                title: `${safeRes} → ${safeTable}`,
            };
        }

        // Fall back to legacy markdown
        const mdPath = resolve(import.meta.dir, "..", "..", "mapspec", safeRes, `${safeTable}.md`);
        const f = Bun.file(mdPath);
        if (await f.exists()) {
            const source = await f.text();
            const html = await ctx.fns.markdown.render(ctx, { source });
            return { html, title: `${safeRes} → ${safeTable}` };
        }
        return null;
    }

    // Resource index: destinations panel + narrative markdown
    const edges = ctx.fns.mapspec.loadEdges(ctx);
    const byR = ctx.fns.mapspec.byResource(ctx, { edges });
    const dests = byR.get(safeRes) ?? [];
    const destsHtml = dests.length ? renderResourceDestinations(safeRes, dests) : "";

    const resourceMdPath = resolve(import.meta.dir, "..", "..", "mapspec", "resources", `${safeRes}.md`);
    const rf = Bun.file(resourceMdPath);
    if (await rf.exists()) {
        const source = await rf.text();
        const md = await ctx.fns.markdown.render(ctx, { source });
        return { html: destsHtml + md, title: safeRes };
    }

    const legacyPath = resolve(import.meta.dir, "..", "..", "mapspec", safeRes, "index.md");
    const lf = Bun.file(legacyPath);
    if (await lf.exists()) {
        const source = await lf.text();
        const md = await ctx.fns.markdown.render(ctx, { source });
        return { html: destsHtml + md, title: safeRes };
    }

    if (destsHtml) return { html: destsHtml, title: safeRes };
    return null;
}

function sanitize(s: string | undefined): string {
    if (!s) return "";
    return s.replace(/[^A-Za-z0-9_-]/g, "");
}

function esc(s: string) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function enc(s: string) {
    return encodeURIComponent(s);
}

function renderReference(r: {
    project: string;
    kind?: string;
    path?: string;
    lines?: [number, number];
    notes?: string;
}): string {
    const kindBadge = r.kind ? `<span class="text-[10px] text-gray-400 ml-1">(${esc(r.kind)})</span>` : "";
    let pathLink = "";
    if (r.path) {
        const linesStr = r.lines ? `:${r.lines[0]}-${r.lines[1]}` : "";
        const q = new URLSearchParams({ path: r.path });
        if (r.lines) {
            q.set("from", String(r.lines[0]));
            q.set("to", String(r.lines[1]));
        }
        pathLink = ` <a href="/source?${q.toString()}" class="font-mono text-[10px] text-blue-600 hover:underline">${esc(r.path)}${linesStr}</a>`;
    }
    const note = r.notes ? ` <span class="text-gray-500">— ${esc(r.notes)}</span>` : "";
    return `<strong class="text-gray-800">${esc(r.project)}</strong>${kindBadge}${pathLink}${note}`;
}

const STATUS_DOT: Record<string, string> = {
    implemented: "bg-green-400",
    documented: "bg-yellow-400",
    stub: "bg-gray-300",
    planned: "bg-blue-300",
};

const STATUS_PILL: Record<string, string> = {
    implemented: "bg-green-100 text-green-800",
    documented: "bg-yellow-100 text-yellow-800",
    stub: "bg-gray-100 text-gray-600",
    planned: "bg-blue-100 text-blue-800",
};

function renderResourceDestinations(resource: string, edges: Edge[]): string {
    const rows = edges
        .slice()
        .sort((a, b) => (Number(b.primary ?? false) - Number(a.primary ?? false)) || a.omop_table.localeCompare(b.omop_table))
        .map((e) => {
            const dot = STATUS_DOT[e.status] ?? "bg-gray-300";
            const pill = STATUS_PILL[e.status] ?? "bg-gray-100 text-gray-600";
            const primary = e.primary
                ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800">primary</span>`
                : "";
            const fields = e.fields?.length ?? 0;
            const narr = e.narrative_md
                ? `<div class="text-xs text-gray-500 mt-0.5">${esc(e.narrative_md)}</div>`
                : "";
            return `<tr class="border-b border-gray-100 hover:bg-gray-50">
  <td class="px-2 py-1.5 whitespace-nowrap">
    <span class="inline-block w-1.5 h-1.5 rounded-full ${dot} mr-1 align-middle"></span>
    <a href="/table/${enc(e.omop_table)}" class="font-mono text-sm text-blue-700 hover:underline">${esc(e.omop_table)}</a>
    ${primary}
    ${narr}
  </td>
  <td class="px-2 py-1.5 text-xs"><span class="px-1.5 py-0.5 rounded ${pill}">${esc(e.status)}</span></td>
  <td class="px-2 py-1.5 text-xs text-gray-500">${fields} field${fields === 1 ? "" : "s"}</td>
  <td class="px-2 py-1.5 text-xs"><a href="/mapspec/${enc(resource)}/${enc(e.omop_table)}" class="text-blue-600 hover:underline">detail →</a></td>
</tr>`;
        })
        .join("");

    return `<div class="not-prose mb-6">
  <div class="flex items-baseline gap-2 mb-3">
    <h1 class="text-2xl font-bold text-gray-900">${esc(resource)}</h1>
    <span class="text-gray-400 text-sm">— maps to ${edges.length} OMOP table${edges.length === 1 ? "" : "s"}</span>
  </div>
  <div class="overflow-x-auto border border-gray-200 rounded-lg">
    <table class="w-full">
      <thead><tr class="bg-gray-50 border-b border-gray-200">
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">OMOP Table</th>
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Mapped</th>
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function renderTablePage(table: string, sources: Edge[]): string {
    const rows = sources
        .slice()
        .sort((a, b) => (Number(b.primary ?? false) - Number(a.primary ?? false)) || a.fhir_resource.localeCompare(b.fhir_resource))
        .map((e) => {
            const dot = STATUS_DOT[e.status] ?? "bg-gray-300";
            const pill = STATUS_PILL[e.status] ?? "bg-gray-100 text-gray-600";
            const primary = e.primary
                ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800">primary</span>`
                : "";
            const cond = e.condition
                ? `<div class="text-[11px] text-amber-700 mt-0.5"><strong>when:</strong> ${esc(e.condition)}</div>`
                : "";
            const narr = e.narrative_md
                ? `<div class="text-xs text-gray-500 mt-0.5">${esc(e.narrative_md)}</div>`
                : "";
            const fields = e.fields?.length ?? 0;
            return `<tr class="border-b border-gray-100 hover:bg-gray-50">
  <td class="px-2 py-1.5 whitespace-nowrap">
    <span class="inline-block w-1.5 h-1.5 rounded-full ${dot} mr-1 align-middle"></span>
    <a href="/mapspec/${enc(e.fhir_resource)}" class="font-medium text-sm text-blue-700 hover:underline">${esc(e.fhir_resource)}</a>
    ${primary}
    ${cond}
    ${narr}
  </td>
  <td class="px-2 py-1.5 text-xs"><span class="px-1.5 py-0.5 rounded ${pill}">${esc(e.status)}</span></td>
  <td class="px-2 py-1.5 text-xs text-gray-500">${fields} field${fields === 1 ? "" : "s"}</td>
  <td class="px-2 py-1.5 text-xs"><a href="/mapspec/${enc(e.fhir_resource)}/${enc(table)}" class="text-blue-600 hover:underline">detail →</a></td>
</tr>`;
        })
        .join("");

    return `<div class="not-prose">
  <div class="flex items-baseline gap-2 mb-3">
    <h1 class="text-2xl font-bold text-gray-900 font-mono">${esc(table)}</h1>
    <span class="text-gray-400 text-sm">— sourced from ${sources.length} FHIR resource${sources.length === 1 ? "" : "s"}</span>
  </div>
  <div class="overflow-x-auto border border-gray-200 rounded-lg">
    <table class="w-full">
      <thead><tr class="bg-gray-50 border-b border-gray-200">
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">FHIR Resource</th>
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Mapped</th>
        <th class="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

async function renderEdge(ctx: Context, edge: Edge): Promise<string> {
    const parts: string[] = [];

    // Header
    parts.push(`<div class="not-prose">`);
    parts.push(`<div class="flex items-center gap-3 mb-4">`);
    parts.push(`<span class="text-2xl font-bold">${esc(edge.fhir_resource)}</span>`);
    parts.push(`<span class="text-gray-400 text-2xl">→</span>`);
    parts.push(`<span class="text-2xl font-bold text-blue-700">${esc(edge.omop_table)}</span>`);
    const statusColors: Record<string, string> = {
        implemented: "bg-green-100 text-green-800",
        documented: "bg-yellow-100 text-yellow-800",
        stub: "bg-gray-100 text-gray-600",
        planned: "bg-blue-100 text-blue-800",
    };
    const sc = statusColors[edge.status] ?? "bg-gray-100 text-gray-600";
    parts.push(`<span class="ml-2 px-2 py-0.5 rounded text-xs font-medium ${sc}">${esc(edge.status)}</span>`);
    if (edge.primary) parts.push(`<span class="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">primary</span>`);

    // Our-pipeline implementation badge: view JSON + ETL SQL both present?
    const viewPath = resolve(import.meta.dir, "..", "..", "mapspec", "views",
        `${edge.fhir_resource}__${edge.omop_table}.view.json`);
    const sqlPath  = resolve(import.meta.dir, "..", "..", "mapspec", "etl",
        `${edge.fhir_resource}__${edge.omop_table}.sql`);
    const hasView = await Bun.file(viewPath).exists();
    const hasSql  = await Bun.file(sqlPath).exists();
    if (hasView && hasSql) {
        parts.push(`<span class="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800" title="ViewDefinition + Stage-2 SQL both present">✓ our impl</span>`);
    } else if (hasView || hasSql) {
        parts.push(`<span class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" title="Only ${hasView ? 'ViewDefinition' : 'Stage-2 SQL'} present">${hasView ? 'view only' : 'sql only'}</span>`);
    }
    parts.push(`</div>`);

    // Narrative — render as markdown (headings, lists, bold, code spans).
    // Wrapped in .prose for typography; mb-4 spacing below.
    if (edge.narrative_md) {
        const html = await ctx.fns.markdown.render(ctx, { source: edge.narrative_md });
        parts.push(`<div class="prose prose-sm max-w-none text-gray-700 mb-4">${html}</div>`);
    }

    // Peer-review (mapspec/reviews/<R>__<T>_review.md) — yellow card.
    // Edges without a review just skip this block.
    const reviewPath = resolve(
        import.meta.dir, "..", "..", "mapspec", "reviews",
        `${edge.fhir_resource}__${edge.omop_table}_review.md`,
    );
    const reviewFile = Bun.file(reviewPath);
    if (await reviewFile.exists()) {
        const md = (await reviewFile.text()).trim();
        if (md) {
            const html = await ctx.fns.markdown.render(ctx, { source: md });
            parts.push(`
<details class="mb-6 rounded-lg border-2 border-amber-400 bg-white">
  <summary class="cursor-pointer px-4 py-2 font-semibold text-amber-900 hover:bg-amber-50 rounded-t-lg">
    📝 Peer review
    <span class="text-xs font-normal text-amber-700 ml-2">vs ${edge.fhir_resource}__${edge.omop_table}_review.md</span>
  </summary>
  <div class="prose prose-sm max-w-none px-4 py-3 text-gray-800">${html}</div>
</details>`);
        }
    }

    // Conversion profile (gate for this edge)
    const profile = await ctx.fns.profiles.profileForEdge(ctx, {
        resource: edge.fhir_resource,
        table: edge.omop_table,
    });
    if (profile) {
        parts.push(await renderProfileCard(ctx, profile));
    }

    // OMOP target table (Stage 2 destination — shown above the view to give
    // the FHIRPath columns a target to map against).
    const omopFields = await ctx.fns.omop.byTable(ctx, { name: edge.omop_table });
    if (omopFields.length > 0) {
        parts.push(renderOmopTableCard(edge.omop_table, omopFields));
    }

    // ViewDefinition (stage-1 flattener for this edge)
    const view = await ctx.fns.profiles.viewForEdge(ctx, {
        resource: edge.fhir_resource,
        table: edge.omop_table,
    });
    const allCms = ((await ctx.fns.profiles.load(ctx)) as any).conceptmaps ?? [];
    const cmByUrl = new Map<string, any>(allCms.map((c: any) => [c.url, c]));
    if (view) {
        parts.push(renderViewCard(view));
    }

    // Stage-2 ETL SQL (declares ConceptMap dependencies via `@relatedArtefact`).
    const etlSqlPath = resolve(
        import.meta.dir, "..", "..", "mapspec", "etl",
        `${edge.fhir_resource}__${edge.omop_table}.sql`,
    );
    const etlFile = Bun.file(etlSqlPath);
    let etlSql = "";
    if (await etlFile.exists()) etlSql = await etlFile.text();

    // ConceptMaps referenced by `-- @relatedArtefact <url>` comments in SQL.
    for (const ref of parseRelatedArtefacts(etlSql)) {
        const cm = cmByUrl.get(ref);
        if (cm) parts.push(renderConceptMapCard(cm));
    }

    if (etlSql) parts.push(renderEtlSqlCard(etlSql, `${edge.fhir_resource}__${edge.omop_table}.sql`));

    // HL7 FHIR-to-OMOP IG StructureMap(s) for the same edge — "their transform"
    // (FHIR Mapping Language) shown next to our SQL-on-FHIR above. Sourced from
    // the refs/refs/fhir-omop-ig submodule; absent edges just skip the card.
    const fmls = await ctx.fns.mapspec.fmlForEdge(ctx, {
        resource: edge.fhir_resource,
        table: edge.omop_table,
    });
    for (const fml of fmls) parts.push(renderFmlCard(fml));

    // Golden test cases relevant to this edge — replaces the retired cdm.* oracle
    // diff + the Synthea sample-rows ("examples") card. These are the correctness
    // gate: self-contained, branch-by-branch, with pass/fail from the last
    // `bun script/run-cases.ts` run. An edge with no covering case is flagged so
    // the page doubles as a transform-coverage view.
    const relCases = await ctx.fns.cases.forEdge(ctx, { resource: edge.fhir_resource, table: edge.omop_table });
    parts.push(renderTestCasesCard(edge.fhir_resource, edge.omop_table, relCases));

    // Condition
    if (edge.condition) {
        parts.push(`<div class="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs"><strong>Condition:</strong> ${esc(edge.condition)}</div>`);
    }

    // Implementation field is obsolete — it pointed to the old src/mapper/*.ts
    // files (deleted ages ago). The actual current implementation is shown by
    // the ViewDefinition card (Stage 1) + ETL SQL card (Stage 2) above.

    // Fields list (one card per field)
    parts.push(`<h3 class="text-sm font-semibold mt-6 mb-2 text-gray-700">Fields <span class="text-gray-400 font-normal">(${edge.fields.length})</span></h3>`);
    parts.push(`<ul class="space-y-2">`);
    for (const f of edge.fields) {
        const badges: string[] = [];
        if (f.pk) badges.push(`<span class="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-[10px] font-medium">PK</span>`);
        if (f.fk) badges.push(`<span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">FK→${esc(f.fk)}</span>`);
        if (f.required) badges.push(`<span class="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-medium">required</span>`);
        // f.concept_map badge removed: legacy decoration that pointed at
        // the inline vocabularies[] table (now retired). Real ConceptMap
        // dependencies live in stage-2 SQL via @relatedArtefact and surface
        // as rose ConceptMap cards above the Fields list.
        if (f.constant !== undefined) badges.push(`<span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium">=${esc(String(f.constant))}</span>`);

        const fhirPathHtml = f.fhir_path
            ? `<code class="font-mono text-gray-600">${esc(f.fhir_path)}</code>`
            : (f.constant !== undefined ? `<span class="text-gray-400 italic">constant</span>` : `<span class="text-gray-400">—</span>`);

        parts.push(`<li class="border border-gray-200 rounded-lg p-3 bg-white hover:bg-gray-50">`);

        // Header: OMOP column ← FHIR path + type + badges
        parts.push(`<div class="flex items-baseline gap-2 flex-wrap mb-1">`);
        parts.push(`<code class="font-mono font-semibold text-gray-900 text-sm">${esc(f.omop_column)}</code>`);
        parts.push(`<span class="text-gray-300 text-xs">←</span>`);
        parts.push(`<span class="text-xs">${fhirPathHtml}</span>`);
        parts.push(`<span class="text-[10px] text-gray-400 ml-auto">${esc(f.omop_type)}${f.fhir_type ? ` <span class="text-gray-300">·</span> ${esc(f.fhir_type)}` : ""}</span>`);
        parts.push(`</div>`);

        if (badges.length) {
            parts.push(`<div class="mb-1.5 flex flex-wrap gap-1">${badges.join("")}</div>`);
        }
        if (f.transform) {
            parts.push(`<div class="mb-1 text-xs"><span class="text-gray-400 mr-1">transform:</span><code class="text-[11px] bg-gray-50 px-1.5 py-0.5 rounded">${esc(f.transform)}</code></div>`);
        }
        if (f.notes) {
            parts.push(`<div class="text-xs text-gray-700 mb-1">${esc(f.notes)}</div>`);
        }

        if (f.sources?.length) {
            parts.push(`<details class="mt-2"><summary class="text-[11px] text-blue-700 cursor-pointer hover:underline select-none">${f.sources.length} source${f.sources.length === 1 ? "" : "s"} ▾</summary>`);
            parts.push(`<ul class="mt-1.5 pl-3 border-l-2 border-gray-200 space-y-2">`);
            for (const s of f.sources) {
                parts.push(`<li>`);
                parts.push(`<div class="text-xs text-gray-800 font-medium">${esc(s.comment)}</div>`);
                parts.push(`<ul class="pl-3 mt-0.5 space-y-0.5">`);
                for (const r of s.references) {
                    parts.push(`<li class="text-[11px]">${renderReference(r)}</li>`);
                }
                parts.push(`</ul>`);
                parts.push(`</li>`);
            }
            parts.push(`</ul></details>`);
        }
        parts.push(`</li>`);
    }
    parts.push(`</ul>`);

    // Vocabularies — DEPRECATED rendering. edge.vocabularies[] was the
    // pre-ConceptMap-card representation, now redundant with the rose
    // ConceptMap cards above (sourced from mapspec/profiles/*.cm.json).
    // Field kept in edge JSON schema for backward compatibility but no
    // longer rendered.

    // Edge cases
    if (edge.edge_cases?.length) {
        parts.push(`<h3 class="text-sm font-semibold mt-6 mb-2 text-gray-700">Edge Cases</h3>`);
        parts.push(`<div class="space-y-2">`);
        for (const ec of edge.edge_cases) {
            parts.push(`<div class="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs">`);
            parts.push(`<div class="font-medium text-gray-800">${esc(ec.case)}</div>`);
            parts.push(`<div class="text-gray-600 mt-0.5">${esc(ec.handling)}</div>`);
            parts.push(`</div>`);
        }
        parts.push(`</div>`);
    }

    // References (edge-level)
    if (edge.references?.length) {
        parts.push(`<h3 class="text-sm font-semibold mt-6 mb-2 text-gray-700">Reference Implementations</h3>`);
        parts.push(`<ul class="text-xs space-y-1">`);
        for (const ref of edge.references) {
            parts.push(`<li>${renderReference(ref)}</li>`);
        }
        parts.push(`</ul>`);
    }

    parts.push(`</div>`);
    return parts.join("\n");
}

// Golden test cases relevant to this edge — links to /cases/<slug> with a
// pass/fail badge from the last run. Empty state flags an uncovered edge.
function renderTestCasesCard(resource: string, table: string, files: any[]): string {
    const header = `<div class="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-200">
    <span class="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold">Golden test cases</span>
    <span class="text-[11px] text-emerald-700 font-mono">${esc(resource)} → ${esc(table)}</span>
  </div>`;

    if (!files.length) {
        return `<div class="mb-6 border border-emerald-200 rounded-lg overflow-hidden">
  ${header}
  <div class="px-4 py-3 text-[13px] text-gray-500 italic">No golden case covers this edge yet — add one under <code class="not-italic">cases/</code> (see <code class="not-italic">cases/README.md</code>). The case suite is the correctness gate.</div>
</div>`;
    }

    const totalVariants = files.reduce((n, f) => n + (f.variantCount ?? 0), 0);
    const rows = files.map((f) => {
        const badge = f.status === "pass"
            ? `<span class="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 shrink-0">✓ ${f.passCount}/${f.ranCount}</span>`
            : f.status === "fail"
                ? `<span class="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 shrink-0">✗ ${f.passCount}/${f.ranCount}</span>`
                : `<span class="px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-400 shrink-0">not run</span>`;
        return `<a href="/cases/${enc(f.slug)}" class="flex items-center justify-between gap-3 px-4 py-2 border-t border-gray-100 hover:bg-emerald-50/50">
    <div class="min-w-0">
      <div class="text-[13px] text-gray-900 font-medium truncate">${esc(f.title ?? f.slug)}</div>
      <div class="font-mono text-[10px] text-gray-400 truncate">${esc(f.slug)}</div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <span class="text-[11px] text-gray-400">${f.variantCount} variant${f.variantCount === 1 ? "" : "s"}</span>
      ${badge}
    </div>
  </a>`;
    }).join("");

    return `<div class="mb-6 border border-emerald-200 rounded-lg overflow-hidden">
  ${header}
  ${rows}
  <div class="px-4 py-1.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">${files.length} file${files.length === 1 ? "" : "s"} · ${totalVariants} variant${totalVariants === 1 ? "" : "s"} assert this edge</div>
</div>`;
}

async function renderProfileCard(ctx: Context, p: types.profiles.Profile): Promise<string> {
    const elements = p.differential?.element ?? [];
    const codeEl = elements.find((e: any) => e.path?.endsWith(".code") && e.binding?.valueSet);
    const codeVs = codeEl?.binding?.valueSet
        ? await ctx.fns.profiles.valueSetByUrl(ctx, { url: codeEl.binding.valueSet })
        : undefined;

    const rows = elements.filter((el: any) => !(el.slicing && !el.sliceName)).map((el: any) => {
        const card = (el.min ?? "") !== "" || el.max
            ? `<span class="font-mono text-[11px] text-gray-700">${el.min ?? ""}..${el.max || "*"}</span>`
            : "";
        const ms = el.mustSupport ? `<span class="ml-1 px-1 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">MS</span>` : "";

        // Path: show sliceName when set, dim discriminator-only rows
        const pathHtml = el.sliceName
            ? `${esc(el.path)}<span class="text-pink-700">:${esc(el.sliceName)}</span>`
            : esc(el.path);

        // Type: show code; if type has profile, link it
        const typeParts = (el.type ?? []).map((t: any) => {
            const code = esc(t.code);
            const profile = (t.profile ?? [])[0];
            if (profile) {
                const short = profile.split("/").pop()!.replace(/^StructureDefinition$/, "Ext");
                return `${code}<a href="${profile}" target="_blank" class="ml-1 text-[10px] text-pink-700 hover:underline" title="${esc(profile)}">${esc(short)}</a>`;
            }
            return code;
        });
        const types = typeParts.join("|");

        const bindingHtml = el.binding
            ? `<a href="${el.binding.valueSet.startsWith("https://fhir2omop") ? `/profiles/${enc(el.binding.valueSet.split("/").pop()!)}` : el.binding.valueSet}" class="text-purple-700 hover:underline">${esc(shortVsUrl(el.binding.valueSet))}</a><span class="text-[10px] uppercase ml-1 text-gray-500">${esc(el.binding.strength)}</span>`
            : (el.fixedCode || el.fixedUri ? `<span class="text-[11px] font-mono text-amber-700">fixed: ${esc(el.fixedCode || el.fixedUri)}</span>` : "");
        const typeBindingParts: string[] = [];
        if (types) typeBindingParts.push(`<span class="font-mono text-gray-600">${types}</span>`);
        if (bindingHtml) typeBindingParts.push(bindingHtml);
        const typeBindingHtml = typeBindingParts.join(`<span class="mx-1 text-gray-300">·</span>`);

        return `<tr class="border-t border-gray-100 align-top">
  <td class="px-2 py-1 font-mono text-[11px] text-gray-800">${pathHtml}</td>
  <td class="px-2 py-1 text-[11px]">${card}${ms}</td>
  <td class="px-2 py-1 text-[11px]">${typeBindingHtml}</td>
  <td class="px-2 py-1 text-[11px] text-gray-500 leading-snug">${esc(el.comment ?? el.short ?? "")}</td>
</tr>`;
    }).join("");

    return `
<div class="mb-6 border border-purple-200 rounded-lg overflow-hidden">
  <div class="flex items-center justify-between px-4 py-2 bg-purple-50 border-b border-purple-200">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-[10px] uppercase tracking-wider text-purple-800 font-semibold">Conversion profile</span>
      <a href="/profiles/${enc(p.id)}" class="font-mono text-sm text-purple-900 hover:underline">${esc(p.id)}</a>
    </div>
    <span class="text-[11px] text-purple-700">A FHIR instance converts to <strong>${esc(p.targetTable ?? "")}</strong> iff it validates against this profile.</span>
  </div>
  ${codeVs ? `
  <div class="px-4 py-2 bg-purple-25 border-b border-purple-100 text-[12px]">
    <span class="text-[10px] uppercase tracking-wider text-purple-700 font-medium mr-2">Routing key</span>
    <code class="bg-white px-1.5 py-0.5 rounded font-mono text-purple-900">${esc(p.type)}.code ∈ <a href="/profiles/${enc(codeVs.id)}" class="underline">${esc(codeVs.id)}</a></code>
    ${(codeVs as any).domain ? `<span class="ml-2 text-[11px] text-gray-600">(OMOP domain <strong>${esc((codeVs as any).domain)}</strong>)</span>` : ""}
  </div>` : ""}
  <table class="w-full bg-white text-[11px]">
    <thead class="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
      <tr>
        <th class="px-2 py-1.5 text-left font-medium">Path</th>
        <th class="px-2 py-1.5 text-left font-medium">Card</th>
        <th class="px-2 py-1.5 text-left font-medium">Type / Binding / Fixed</th>
        <th class="px-2 py-1.5 text-left font-medium">Comment</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function renderOmopTableCard(table: string, fields: types.omop.Field[]): string {
    const rows = fields.map((f) => {
        const isSource = /_source_/.test(f.name);
        const pk = f.isPrimaryKey
            ? `<span class="ml-1 px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 text-[9px] font-semibold">PK</span>`
            : "";
        const req = f.required
            ? `<span class="text-red-600 font-bold" title="NOT NULL">*</span>`
            : `<span class="text-gray-300">·</span>`;
        const fk = f.fkTable
            ? `<a href="/table/${enc(f.fkTable.toLowerCase())}" class="font-mono text-[11px] ${isSource ? "text-gray-400" : "text-blue-700"} hover:underline">${esc(f.fkTable.toLowerCase())}${f.fkField ? "." + esc(f.fkField.toLowerCase()) : ""}</a>`
            : "";
        const guidance = f.userGuidance
            ? `<div class="text-[10px] ${isSource ? "text-gray-400" : "text-gray-500"} leading-snug">${esc(f.userGuidance.slice(0, 200))}${f.userGuidance.length > 200 ? "…" : ""}</div>`
            : "";
        const rowCls = isSource ? "text-gray-400" : "";
        const nameCls = isSource ? "text-gray-400" : "text-gray-900";
        const typeCls = isSource ? "text-gray-400" : "text-purple-700";
        return `<tr class="border-t border-gray-100 align-top ${rowCls}">
  <td class="px-2 py-1 font-mono text-[11px] font-semibold ${nameCls} whitespace-nowrap">${esc(f.name)}${pk}</td>
  <td class="px-2 py-1 text-center">${req}</td>
  <td class="px-2 py-1 font-mono text-[11px] ${typeCls} whitespace-nowrap">${esc(f.type)}</td>
  <td class="px-2 py-1 whitespace-nowrap">${fk}</td>
  <td class="px-2 py-1 text-[11px]">${guidance}</td>
</tr>`;
    }).join("");

    return `
<div class="mb-6 border border-indigo-200 rounded-lg overflow-hidden">
  <div class="flex items-center justify-between px-4 py-2 bg-indigo-50 border-b border-indigo-200">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-[10px] uppercase tracking-wider text-indigo-800 font-semibold">OMOP CDM v5.4 target</span>
      <a href="/table/${enc(table)}" class="font-mono text-sm text-indigo-900 hover:underline">${esc(table)}</a>
    </div>
    <span class="text-[11px] text-indigo-700">${fields.length} columns · <span class="text-red-600 font-bold">*</span> = required</span>
  </div>
  <table class="w-full bg-white text-[11px]">
    <thead class="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
      <tr>
        <th class="px-2 py-1.5 text-left font-medium w-56">column</th>
        <th class="px-2 py-1.5 text-center font-medium w-8">req</th>
        <th class="px-2 py-1.5 text-left font-medium w-32">type</th>
        <th class="px-2 py-1.5 text-left font-medium w-48">FK</th>
        <th class="px-2 py-1.5 text-left font-medium">guidance</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// Parse `-- @relatedArtefact <url>` directives from a stage-2 SQL file.
function parseRelatedArtefacts(sql: string): string[] {
    const out: string[] = [];
    const re = /--\s*@relatedArtefact\s+(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
        if (!out.includes(m[1]!)) out.push(m[1]!);
    }
    return out;
}

function renderConceptMapCard(cm: any): string {
    const groups = cm.group ?? [];
    let total = 0;
    const groupHtml = groups.map((g: any) => {
        const elements = g.element ?? [];
        total += elements.length;
        const rows = elements.map((el: any) => {
            const targets = (el.target ?? []).map((t: any) => `<span class="font-mono text-emerald-700">${esc(t.code)}</span> <span class="text-[10px] text-gray-500">${esc(t.display ?? "")}</span>${t.equivalence && t.equivalence !== "equivalent" ? `<span class="ml-1 px-1 rounded bg-amber-100 text-amber-800 text-[9px]">${esc(t.equivalence)}</span>` : ""}`).join(`<span class="mx-1 text-gray-300">,</span>`);
            return `<tr class="border-t border-gray-100">
  <td class="px-2 py-1 font-mono text-[11px] text-rose-700 whitespace-nowrap">${esc(el.code)}</td>
  <td class="px-2 py-1 text-[10px] text-gray-500">${esc(el.display ?? "")}</td>
  <td class="px-2 py-1 text-[10px] text-gray-400">→</td>
  <td class="px-2 py-1 text-[11px]">${targets}</td>
</tr>`;
        }).join("");
        const groupHdr = `<tr class="bg-rose-50/40"><td colspan="4" class="px-2 py-1 text-[10px] text-rose-800"><span class="uppercase tracking-wider font-semibold mr-2">group</span><code class="font-mono">${esc(shortVsUrl(g.source ?? "?"))}</code><span class="mx-2 text-gray-400">→</span><code class="font-mono text-emerald-800">${esc(shortVsUrl(g.target ?? "?"))}</code></td></tr>`;
        return groupHdr + rows;
    }).join("");

    return `
<div class="mb-6 border border-rose-200 rounded-lg overflow-hidden" id="cm-${enc(cm.id)}">
  <div class="flex items-center justify-between px-4 py-2 bg-rose-50 border-b border-rose-200">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-[10px] uppercase tracking-wider text-rose-800 font-semibold">ConceptMap</span>
      <code class="font-mono text-sm text-rose-900">${esc(cm.id)}</code>
      ${cm.title ? `<span class="text-[11px] text-gray-600">— ${esc(cm.title)}</span>` : ""}
    </div>
    <span class="text-[11px] text-rose-700">${total} mapping${total === 1 ? "" : "s"}${groups.length > 1 ? ` · ${groups.length} groups` : ""}</span>
  </div>
  ${cm.description ? `<div class="px-4 py-2 text-[11px] text-gray-600 bg-rose-25 border-b border-rose-100">${esc(cm.description)}</div>` : ""}
  <table class="w-full bg-white text-[11px]">
    <thead class="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
      <tr>
        <th class="px-2 py-1.5 text-left font-medium w-28">source code</th>
        <th class="px-2 py-1.5 text-left font-medium">source display</th>
        <th class="px-2 py-1.5 text-left font-medium w-6"></th>
        <th class="px-2 py-1.5 text-left font-medium">target</th>
      </tr>
    </thead>
    <tbody>${groupHtml}</tbody>
  </table>
</div>`;
}

function renderViewCard(v: any): string {
    const consts: any[] = v.constant ?? [];

    const highlightConst = (path: string): string => {
        let html = esc(path);
        for (const c of consts) {
            const re = new RegExp("%" + c.name + "\\b", "g");
            html = html.replace(re, `<span class="text-pink-700 font-semibold" title="${esc(c.valueString ?? c.valueInteger ?? "")}">%${esc(c.name)}</span>`);
        }
        return html;
    };

    // Walk nested select tree; emit a section per non-empty group, headed by
    // the forEach / forEachOrNull / unionAll iterator if present.
    let totalCols = 0;
    const sections: string[] = [];
    const visit = (sel: any, depth: number, parentLabel?: string) => {
        const label =
            sel.forEachOrNull ? { kind: "forEachOrNull", expr: sel.forEachOrNull }
            : sel.forEach       ? { kind: "forEach",       expr: sel.forEach }
            : sel.unionAll      ? { kind: "unionAll",      expr: null }
            : undefined;

        const cols = sel.column ?? [];
        totalCols += cols.length;
        if (cols.length > 0) {
            const rows = cols.map((c: any) => `<tr class="border-t border-gray-100">
  <td class="px-2 py-1 font-mono text-[11px] font-semibold text-gray-900 whitespace-nowrap" style="padding-left:${0.5 + depth * 1}rem">${esc(c.name)}</td>
  <td class="px-2 py-1 font-mono text-[11px] text-blue-700">${highlightConst(c.path)}</td>
  <td class="px-2 py-1 text-[10px] uppercase text-gray-500">${esc(c.type ?? "")}</td>
</tr>`).join("");
            const headerRow = label
                ? `<tr class="bg-amber-50/60"><td colspan="3" class="px-2 py-1 text-[11px] text-amber-800" style="padding-left:${0.5 + depth * 1}rem"><span class="text-[10px] uppercase tracking-wider font-semibold mr-2">${esc(label.kind)}</span>${label.expr ? `<code class="font-mono text-amber-900">${highlightConst(label.expr)}</code>` : ""}${parentLabel ? `<span class="ml-2 text-[10px] text-gray-500">(nested in ${esc(parentLabel)})</span>` : ""}</td></tr>`
                : "";
            sections.push(headerRow + rows);
        }
        for (const child of sel.select ?? []) visit(child, depth + 1, label?.kind);
    };
    for (const top of v.select ?? []) visit(top, 0);

    const constRows = consts.map((c) => {
        const valueKey = Object.keys(c).find((k) => k.startsWith("value")) ?? "valueString";
        const val = (c as any)[valueKey];
        return `<tr class="border-t border-orange-100">
  <td class="px-2 py-1 font-mono text-[11px] font-semibold text-pink-700 whitespace-nowrap">%${esc(c.name)}</td>
  <td class="px-2 py-1 text-[10px] uppercase text-gray-500 whitespace-nowrap">${esc(valueKey.replace(/^value/, "").toLowerCase())}</td>
  <td class="px-2 py-1 font-mono text-[11px] text-gray-700 break-all">${esc(String(val))}</td>
</tr>`;
    }).join("");

    return `
<div class="mb-6 border border-orange-200 rounded-lg overflow-hidden">
  <div class="flex items-center justify-between px-4 py-2 bg-orange-50 border-b border-orange-200">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-[10px] uppercase tracking-wider text-orange-800 font-semibold">ViewDefinition (Stage 1 flattener)</span>
      <a href="/profiles/${enc(v.id)}" class="font-mono text-sm text-orange-900 hover:underline">${esc(v.id)}</a>
    </div>
    <span class="text-[11px] text-orange-700">${totalCols} columns${consts.length ? ` · ${consts.length} variable${consts.length === 1 ? "" : "s"}` : ""} · resource <code class="bg-white px-1 rounded">${esc(v.resource)}</code></span>
  </div>
  ${consts.length ? `
  <div class="bg-orange-25 border-b border-orange-100">
    <div class="px-4 py-1 text-[10px] uppercase tracking-wider text-orange-700 font-medium bg-orange-50/40">Variables (constant)</div>
    <table class="w-full bg-white text-[11px]">
      <tbody>${constRows}</tbody>
    </table>
  </div>` : ""}
  <table class="w-full bg-white text-[11px]">
    <thead class="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
      <tr>
        <th class="px-2 py-1.5 text-left font-medium w-64">column name</th>
        <th class="px-2 py-1.5 text-left font-medium">FHIRPath</th>
        <th class="px-2 py-1.5 text-left font-medium w-24">type</th>
      </tr>
    </thead>
    <tbody>${sections.join("")}</tbody>
  </table>
</div>`;
}



function num(n: number): string {
    return n.toLocaleString();
}

function renderEtlSqlCard(sql: string, filename: string): string {
    const lines = sql.split("\n").length;
    const highlighted = highlightSql(sql);
    return `
<div class="mb-6 border border-emerald-200 rounded-lg overflow-hidden">
  <div class="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-200">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold">Stage 2 ETL SQL (demo)</span>
      <code class="font-mono text-sm text-emerald-900">${esc(filename)}</code>
    </div>
    <span class="text-[11px] text-emerald-700">${lines} lines · joins <code class="bg-white px-1 rounded">vocab.*</code></span>
  </div>
  <pre class="px-4 py-3 text-[11px] leading-relaxed overflow-x-auto bg-white font-mono whitespace-pre m-0">${highlighted}</pre>
</div>`;
}

// HL7 FHIR-to-OMOP IG StructureMap card — the IG's FHIR Mapping Language
// transform for this edge, shown right below our Stage-2 SQL so the two
// approaches sit side by side. Links to the raw .fml (source viewer) and the
// upstream canonical URL.
function renderFmlCard(fml: {
    file: string;
    path: string;
    name?: string;
    title?: string;
    url?: string;
    description?: string;
    fml: string;
}): string {
    const lines = fml.fml.split("\n").length;
    const highlighted = highlightFml(fml.fml);
    const q = new URLSearchParams({ path: fml.path });
    const upstream = fml.url
        ? `<a href="${esc(fml.url)}" target="_blank" rel="noopener" class="text-[11px] text-sky-700 hover:underline">canonical ↗</a>`
        : "";
    return `
<div class="mb-6 border border-sky-200 rounded-lg overflow-hidden">
  <div class="flex items-center justify-between px-4 py-2 bg-sky-50 border-b border-sky-200">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-[10px] uppercase tracking-wider text-sky-800 font-semibold">HL7 FHIR→OMOP IG · StructureMap (FML)</span>
      <a href="/source?${q.toString()}" class="font-mono text-sm text-sky-900 hover:underline">${esc(fml.file)}</a>
    </div>
    <span class="text-[11px] text-sky-700">${lines} lines${upstream ? ` · ${upstream}` : ""}</span>
  </div>
  ${fml.title ? `<div class="px-4 py-2 text-[12px] text-gray-700 bg-sky-25 border-b border-sky-100"><strong>${esc(fml.title)}</strong>${fml.description ? `<div class="text-[11px] text-gray-500 mt-0.5">${esc(fml.description)}</div>` : ""}</div>` : ""}
  <pre class="px-4 py-3 text-[11px] leading-relaxed overflow-x-auto bg-white font-mono whitespace-pre m-0">${highlighted}</pre>
</div>`;
}

// Lightweight FHIR Mapping Language highlighter — metadata, keywords, strings,
// comments. Order matters: comments/metadata before keyword/string passes.
function highlightFml(src: string): string {
    const esc1 = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const out = src.split("\n").map((line) => {
        let h = esc1(line);
        // /// metadata header lines
        if (/^\s*\/\/\//.test(line)) {
            return `<span style="color:#0891b2">${h}</span>`;
        }
        // // line comments
        h = h.replace(/(\/\/[^\n]*)/g, '<span style="color:#94a3b8">$1</span>');
        // double-quoted strings
        h = h.replace(/(&quot;[^&]*?&quot;|"[^"]*")/g, '<span style="color:#16a34a">$1</span>');
        // single-quoted strings
        h = h.replace(/('[^']*')/g, '<span style="color:#16a34a">$1</span>');
        // keywords
        const kws = [
            "uses", "alias", "as", "source", "target", "group", "then",
            "where", "imports", "extends", "default", "first", "last",
            "translate", "cast", "create", "copy", "truncate", "reference",
        ];
        const kwRe = new RegExp("\\b(" + kws.join("|") + ")\\b", "g");
        h = h.replace(kwRe, '<span style="color:#0369a1;font-weight:600">$1</span>');
        return h;
    }).join("\n");
    return out;
}

// Lightweight SQL syntax highlighter — keywords + strings + numbers + comments.
function highlightSql(sql: string): string {
    const esc1 = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let out = esc1(sql);
    // Line comments
    out = out.replace(/(--[^\n]*)/g, '<span style="color:#94a3b8">$1</span>');
    // Strings (single-quoted)
    out = out.replace(/(&#39;[^&#39;]*?&#39;|'[^']*')/g, '<span style="color:#16a34a">$1</span>');
    // Numbers
    out = out.replace(/\b(\d+)\b/g, '<span style="color:#9333ea">$1</span>');
    // Keywords (case-insensitive, word-boundary)
    const kws = [
        "WITH", "AS", "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "JOIN",
        "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "LATERAL", "ON", "USING",
        "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "RETURNING",
        "GROUP", "BY", "HAVING", "ORDER", "LIMIT", "OFFSET", "DISTINCT",
        "UNION", "ALL", "EXCEPT", "INTERSECT", "CASE", "WHEN", "THEN", "ELSE", "END",
        "IS", "NULL", "TRUE", "FALSE", "IN", "EXISTS", "BETWEEN", "LIKE",
        "CAST", "COALESCE", "COUNT", "SUM", "MIN", "MAX", "AVG",
        "ROW_NUMBER", "OVER", "PARTITION",
        "CREATE", "TABLE", "INDEX", "VIEW", "DROP", "ALTER", "SCHEMA",
    ];
    const kwRe = new RegExp("\\b(" + kws.join("|") + ")\\b", "gi");
    out = out.replace(kwRe, '<span style="color:#0369a1;font-weight:600">$1</span>');
    return out;
}

function shortVsUrl(u: string): string {
    if (u.startsWith("http://hl7.org/fhir/ValueSet/")) return "fhir/" + u.split("/").pop();
    if (u.startsWith("https://fhir2omop.health-samurai.io/ValueSet/")) return u.split("/").pop()!;
    return u;
}
