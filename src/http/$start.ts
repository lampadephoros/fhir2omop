export default async function (ctx: Context) {
    // Stable, project-unique 5-digit port derived from the working directory,
    // so each project gets its own and we stop colliding with common ports
    // (3000/4000) or sibling dev servers. An explicit PORT env var wins and is
    // used verbatim; otherwise the derived port advances on EADDRINUSE so a
    // restart never crashes on a busy port.
    const explicit = Number(ctx.env.PORT) || 0;
    const logFile = Bun.file(".hyper/_runtime/http.log").writer();
    (ctx.state as any).http = { logFile };

    // Default idleTimeout (10s) is fine for normal requests. Long-poll routes
    // override per-request via ctx.state.server.server.timeout(req, ...).
    const fetchHandler = async (req: Request): Promise<Response> => {
        const t0 = performance.now();
        const url = new URL(req.url);
        const m = ctx.fns.http.match(ctx.routes, req.method, url.pathname);
        if (!m) {
            log(logFile, req.method, url.pathname + url.search, 404, performance.now() - t0);
            return new Response("Not Found", { status: 404 });
        }
        (req as any).params = m.params;
        try {
            const raw = await m.handler(ctx, null, req);
            const res = toResponse(ctx, raw, req);
            log(logFile, req.method, url.pathname + url.search, res.status, performance.now() - t0);
            return res;
        } catch (e: any) {
            log(logFile, req.method, url.pathname + url.search, 500, performance.now() - t0, e?.message);
            throw e;
        }
    };

    let port = explicit || projectPort(process.cwd());
    let server: any;
    for (let attempt = 0; attempt < 25 && !server; attempt++) {
        try {
            server = Bun.serve({ port, hostname: "0.0.0.0", fetch: fetchHandler });
        } catch (e: any) {
            // Advance only for the derived port; an explicit PORT is honored exactly.
            if (e?.code === "EADDRINUSE" && !explicit) { port++; continue; }
            throw e;
        }
    }
    if (!server) throw new Error(`no free 5-digit port found near ${port}`);
    ctx.state.server = { server, port };
    await Bun.write(".hyper/_runtime/port", String(port));
    console.log(`[server] listening on http://localhost:${port}  (written to .hyper/_runtime/port)`);
}

// Stable 5-digit port unique to the project directory (djb2-style hash →
// 20000..44999, below macOS's ephemeral range so we don't fight transient
// sockets). Same cwd → same port across restarts.
function projectPort(seed: string): number {
    let h = 5381;
    for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
    return 20000 + (h % 25000);
}

// Auto-wrap handler return values:
//   Response              → passthrough
//   string                → HTML, wrapped with ctx.layout({ main: string })
//   { main, title?, ... } → HTML, wrapped with ctx.layout(opts)
//   other                 → JSON
function toResponse(ctx: Context, v: any, req?: Request): Response {
    if (v instanceof Response) return v;
    const layout = (ctx as any).layout;
    if (typeof v === "string" && layout) {
        return new Response(layout(ctx, { main: v }, req), { headers: htmlHeaders() });
    }
    if (v && typeof v === "object" && typeof v.main === "string" && layout) {
        const { status, ...opts } = v;
        return new Response(layout(ctx, opts, req), { status: status ?? 200, headers: htmlHeaders() });
    }
    return new Response(JSON.stringify(v ?? null), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function htmlHeaders() {
    return { "content-type": "text/html; charset=utf-8" };
}

function log(sink: any, method: string, path: string, status: number, ms: number, err?: string) {
    const dur = ms < 1 ? `${ms.toFixed(2)}ms` : `${ms.toFixed(0)}ms`;
    const color = ms > 500 ? "\x1b[31m" : ms > 100 ? "\x1b[33m" : "\x1b[2m";
    const reset = "\x1b[0m";
    const ts = new Date().toISOString();
    console.log(`[http] ${method.padEnd(6)} ${String(status).padEnd(3)} ${color}${dur.padStart(7)}${reset}  ${path}${err ? `  ${err}` : ""}`);
    try {
        sink.write(`${ts} ${method.padEnd(6)} ${String(status).padEnd(3)} ${dur.padStart(7)}  ${path}${err ? `  ${err}` : ""}\n`);
        sink.flush();
    } catch { /* writer closed */ }
}
