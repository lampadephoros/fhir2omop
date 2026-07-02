import { resolve } from "node:path";
import { readdirSync } from "node:fs";

// Find the HL7 FHIR-to-OMOP IG StructureMap(s) (FHIR Mapping Language, .fml)
// that target the same (FHIR resource → OMOP table) edge we map ourselves, so
// the edge page can show "their transform" next to our Stage-2 SQL-on-FHIR.
//
// Source of truth: the fhir-omop-ig submodule under
// refs/refs/fhir-omop-ig/input/maps/*.fml. We parse each map's `uses … as
// source` / `uses … as target` declarations rather than hard-coding a table,
// so new maps light up automatically once the submodule is pulled.
//
// Matching is by (source FHIR resource, target OMOP table). One edge may match
// several maps — e.g. Observation→measurement is covered by Measurement.fml
// plus the BloodPressure / SimpleVitalSigns vital-signs maps.

type FmlEntry = {
    file: string;        // basename, e.g. "PersonMap.fml"
    path: string;        // repo-relative path for the /source viewer
    name?: string;       // /// name
    title?: string;      // /// title
    url?: string;        // /// url (upstream canonical)
    description?: string;// /// description
    fml: string;         // full file text
    sources: string[];   // FHIR resource types (source `uses`)
    tables: string[];    // OMOP table names, snake_case (target `uses`)
};

// FHIR profile id → base resource (vital-signs maps `uses` a profile, not the
// base Observation). Extend if the IG adds more profile-keyed maps.
const PROFILE_TO_RESOURCE: Record<string, string> = {
    bp: "Observation",
    vitalsigns: "Observation",
    bodyheight: "Observation",
    bodyweight: "Observation",
};

function lastSegment(url: string): string {
    return url.split("/").filter(Boolean).pop() ?? url;
}

function camelToSnake(s: string): string {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function parseFml(file: string, relPath: string, text: string): FmlEntry {
    const meta: Record<string, string> = {};
    const sources: string[] = [];
    const tables: string[] = [];

    for (const raw of text.split("\n")) {
        const line = raw.trim();

        // Metadata: /// key = 'value'  (single or double quoted)
        const m = line.match(/^\/\/\/\s*(\w+)\s*=\s*(.+)$/);
        if (m) {
            meta[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
            continue;
        }

        // uses "<url>" [alias X] as source|target
        const u = line.match(/^uses\s+"([^"]+)"(?:\s+alias\s+\w+)?\s+as\s+(source|target)/);
        if (u) {
            const url = u[1]!;
            const role = u[2]!;
            const seg = lastSegment(url);
            if (role === "source") {
                const res = PROFILE_TO_RESOURCE[seg] ?? seg;
                if (!sources.includes(res)) sources.push(res);
            } else if (url.includes("/uv/omop/StructureDefinition/")) {
                // Only the OMOP logical-model targets name a table; ignore
                // intermediates like Bundle.
                const tbl = camelToSnake(seg);
                if (!tables.includes(tbl)) tables.push(tbl);
            }
        }
    }

    return {
        file,
        path: relPath,
        name: meta.name,
        title: meta.title,
        url: meta.url,
        description: meta.description,
        fml: text,
        sources,
        tables,
    };
}

export default async function (
    ctx: Context,
    opts: { resource: string; table: string },
): Promise<FmlEntry[]> {
    const mapsDir = resolve(import.meta.dir, "..", "..", "refs", "refs", "fhir-omop-ig", "input", "maps");

    let files: string[];
    try {
        files = readdirSync(mapsDir).filter((f) => f.endsWith(".fml"));
    } catch {
        // Submodule not checked out — degrade gracefully (no FML cards).
        return [];
    }

    const out: FmlEntry[] = [];
    for (const file of files) {
        const relPath = `refs/refs/fhir-omop-ig/input/maps/${file}`;
        const text = await Bun.file(resolve(mapsDir, file)).text();
        const entry = parseFml(file, relPath, text);
        if (entry.sources.includes(opts.resource) && entry.tables.includes(opts.table)) {
            out.push(entry);
        }
    }

    // Stable, readable order: the map whose name echoes the resource first.
    out.sort((a, b) => a.file.localeCompare(b.file));
    return out;
}
