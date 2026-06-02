// GET /cases/:name — one golden test case rendered (FHIR input + expected OMOP).
// Special name "new" renders the blank structured editor (avoids a colliding
// literal route under the no-specificity matcher).
export default async function (ctx: Context, _session: any, req: Request) {
    const { name } = (req as any).params as { name: string };
    if (name === "new") {
        const main = await ctx.fns.cases.renderEditor(ctx, { isNew: true });
        return { title: "New test case", current: "cases", main };
    }
    const cases = await ctx.fns.cases.load(ctx);
    const c = cases.find((x: any) => x.slug === name);
    if (!c) return new Response("case not found", { status: 404 });
    const main = await ctx.fns.cases.renderDetail(ctx, { case: c });
    return { title: c.title, current: "cases", main };
}
