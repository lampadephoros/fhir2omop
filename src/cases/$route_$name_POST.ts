// POST /cases/:name — save the structured-form payload to cases/:name.json,
// then run the single file through the real pipeline. Returns { saved, run }.
export default async function (ctx: Context, _session: any, req: Request) {
    const { name } = (req as any).params as { name: string };
    const json = (h: any, status = 200) => new Response(JSON.stringify(h), { status, headers: { "content-type": "application/json" } });
    let payload: any;
    try { payload = await req.json(); } catch { return json({ saved: { ok: false, error: "invalid JSON body" } }); }

    const saved = await ctx.fns.cases.save(ctx, { slug: name, payload });
    if (!saved.ok) return json({ saved });
    const run = await ctx.fns.cases.runOne(ctx, { slug: name });
    return json({ saved, run });
}
