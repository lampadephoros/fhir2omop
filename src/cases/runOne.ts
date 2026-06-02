// Run a single golden case file through the real pipeline (script/run-cases.ts
// filtered to the slug) and return the per-variant pass/fail. Used by the editor's
// Save & Run. Needs the live Postgres (full Athena) — takes a few seconds.
export default async function (ctx: Context, opts: { slug: string }): Promise<{
    ok: boolean;
    error?: string;
    pass?: number;
    fail?: number;
    variants?: { desc: string; pass: boolean; failures: string[] }[];
}> {
    const slug = String(opts.slug ?? "").trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { ok: false, error: `bad slug "${slug}"` };

    const proc = Bun.spawn(["bun", "script/run-cases.ts", slug], {
        env: { ...process.env, RC_SUFFIX: `ui_${slug.replace(/[^a-z0-9]/g, "").slice(0, 24)}` },
        stdout: "pipe",
        stderr: "pipe",
    });
    const code = await proc.exited;
    const stderr = (await new Response(proc.stderr).text()).trim();

    // The runner merges results into .hyper/_runtime/case-results.json keyed by slug.
    let variants: { desc: string; pass: boolean; failures: string[] }[] = [];
    try {
        const rr = JSON.parse(await Bun.file(".hyper/_runtime/case-results.json").text());
        variants = (rr.files?.[slug]?.variants ?? []).map((v: any) => ({
            desc: v.desc ?? "", pass: !!v.pass, failures: v.failures ?? [],
        }));
    } catch { /* none */ }

    if (!variants.length) {
        return { ok: false, error: stderr.split("\n").filter(Boolean).slice(-6).join("\n") || `run-cases exited ${code} with no results for "${slug}"` };
    }
    const pass = variants.filter((v) => v.pass).length;
    return { ok: code === 0 && pass === variants.length, pass, fail: variants.length - pass, variants };
}
