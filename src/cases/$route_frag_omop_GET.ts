// GET /cases/frag/omop?kind=table|row&table=<t> — htmx fragment for the
// structured expected-OMOP editor: a full-column table block, or one more row.
export default async function (ctx: Context, _session: any, req: Request) {
    const u = new URL(req.url);
    const kind = u.searchParams.get("kind") === "table" ? "table" : "row";
    const table = u.searchParams.get("table") ?? "";
    const html = await ctx.fns.cases.omopFrag(ctx, { kind, table });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
