async function main() {
    const ctx = {
        env: { ...process.env },
        state: {},
        fns: {} as FnsRegistry,
        routes: {},
    } as Context;

    const { default: loadFns } = await import("./loadFns");
    await loadFns(ctx);
    await ctx.genTypes(ctx);
    await ctx.fns.http.loadRoutes(ctx);
    await ctx.fns.http.start(ctx);

    return ctx;
}

export default main;

// Call the local main() directly — do NOT re-import this module. Under Bun 1.3.14
// the re-entrant `await import("./$main.ts")` from the entry module spins at ~100%
// CPU (the self-import recurses instead of returning the already-cached module).
if (import.meta.main) {
    const ctx = await main();
    (globalThis as any).ctx = ctx;
    console.log("\nctx keys:", Object.keys(ctx));
}
