// Persist a golden case file edited/created from the UI editor.
//
// The structured-form editor posts the case skeleton with FHIR resources and the
// expected OMOP rows as YAML text (FHIR/omop are too free-form for fields); this
// parses those, assembles the canonical { title, notes, fixtures, cases } shape,
// validates lightly, and writes cases/<slug>.json. Returns { ok } or { error }.
//
// Local dev tool: slug is hard-restricted to kebab (no '/', '.', traversal).
type Payload = {
    title?: string;
    notes?: string;
    fixtures?: string[]; // YAML strings, one FHIR resource each
    cases?: { desc?: string; fhir?: string[]; omop?: string }[]; // omop = YAML of { table: [rows] }
};

function parseYaml(label: string, text: string): any {
    const t = (text ?? "").trim();
    if (!t) return undefined;
    try {
        return (Bun as any).YAML.parse(t);
    } catch (e: any) {
        throw new Error(`${label}: invalid YAML — ${e?.message ?? e}`);
    }
}

export default async function (ctx: Context, opts: { slug: string; payload: Payload }): Promise<{ ok: boolean; error?: string; path?: string }> {
    const slug = String(opts.slug ?? "").trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return { ok: false, error: `bad slug "${slug}" — use lowercase letters, digits, hyphens (e.g. observation--measurement--value)` };
    }
    const p = opts.payload ?? {};
    if (!p.title || !String(p.title).trim()) return { ok: false, error: "title is required" };

    try {
        const fixtures = (p.fixtures ?? []).map((y, i) => parseYaml(`fixture #${i + 1}`, y)).filter((x) => x !== undefined);
        const cases = (p.cases ?? []).map((c, i) => {
            const fhir = (c.fhir ?? []).map((y, j) => parseYaml(`variant #${i + 1} fhir #${j + 1}`, y)).filter((x) => x !== undefined);
            const omopParsed = parseYaml(`variant #${i + 1} omop`, c.omop ?? "");
            const omop = omopParsed ?? {};
            if (typeof omop !== "object" || Array.isArray(omop)) {
                throw new Error(`variant #${i + 1} omop must be an object { table: [rows] } (or empty for a negative case)`);
            }
            return { desc: String(c.desc ?? "").trim(), fhir, omop };
        });
        if (!cases.length) return { ok: false, error: "at least one variant is required" };

        const fileObj: any = { title: String(p.title).trim() };
        if (p.notes && String(p.notes).trim()) fileObj.notes = String(p.notes).trim();
        if (fixtures.length) fileObj.fixtures = fixtures;
        fileObj.cases = cases;

        const path = `cases/${slug}.json`;
        await Bun.write(path, JSON.stringify(fileObj, null, 2) + "\n");
        return { ok: true, path };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}
