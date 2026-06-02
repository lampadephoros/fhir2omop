// GET /cases/:name/edit — structured editor for an existing golden case.
export default async function (ctx: Context, _session: any, req: Request) {
    const { name } = (req as any).params as { name: string };
    const cases = await ctx.fns.cases.load(ctx);
    const c = cases.find((x: any) => x.slug === name);
    if (!c) return new Response("case not found", { status: 404 });
    const main = await ctx.fns.cases.renderEditor(ctx, { file: c, slug: name });
    return { title: `Edit: ${c.title}`, current: "cases", main };
}
