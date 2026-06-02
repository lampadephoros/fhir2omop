// GET /cases/frag/omop?kind=table|row|cell&table=<t> — an htmx fragment for the
// structured expected-OMOP editor (blank table block / row / cell).
export default async function (ctx: Context, _session: any, req: Request) {
    const u = new URL(req.url);
    const kind = (u.searchParams.get("kind") ?? "row") as "table" | "row" | "cell";
    const table = u.searchParams.get("table") ?? "";
    const html = await ctx.fns.cases.omopFrag(ctx, { kind, table });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
