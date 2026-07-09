#!/usr/bin/env bun
// Normalize FHIR references in fhir.* so that identifier-based (conditional)
// references resolve to a deterministic surrogate id, and literal references
// are remapped to match. Run after load-fhir.
//
// Why: Synthea references serviceProvider / participant by CONDITIONAL
// reference — `Organization?identifier=<sys>|<val>` / `Practitioner?identifier=
// http://hl7.org/fhir/sid/us-npi|<npi>` — not `Type/id`. Our surrogate keys are
// hashtextextended(resource.id), so a visit's care_site_id/provider_id (hashed
// from the identifier token) never matched the care_site/provider PK (hashed
// from resource.id). DQD flagged 100% FK violations.
//
// Fix (deterministic, no lookup needed):
//   - every resource gets id = uuid5(resourceType | primary-identifier)
//     (or uuid5(resourceType | old-id) if it has no business identifier);
//   - a conditional reference `Type?identifier=sys|val` is rewritten to
//     `Type/uuid5(Type | sys | val)` — the SAME value the target resource
//     computes for itself, so both sides hash equal;
//   - literal `Type/oldid` and `urn:uuid:oldid` references are remapped to the
//     resource's new id.
//
//   bun script/normalize-refs.ts

import { SQL } from "bun";
import { createHash } from "node:crypto";

const DSN = process.env.ATHENA_DSN ?? "postgresql://athena:athena@localhost:54392/athena";
const sql = new SQL(DSN, { idleTimeout: 0, maxLifetime: 0 });

// Fixed namespace UUID for our uuid5 derivations.
const NS = "6b3d1a2e-9c4f-5e8a-b7d2-1f0a3c5e7b9d";
function uuid5(name: string): string {
    const nsBytes = Buffer.from(NS.replace(/-/g, ""), "hex");
    const h = createHash("sha1").update(nsBytes).update(Buffer.from(name, "utf8")).digest();
    const b = Buffer.from(h.subarray(0, 16));
    b[6] = (b[6]! & 0x0f) | 0x50; // version 5
    b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
    const hex = b.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


const tables: { table_name: string }[] = await sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'fhir' ORDER BY table_name`;

// ── Pass A: build id maps ───────────────────────────────────────────────────
const newIdByOrig = new Map<string, string>();   // `${Type}/${oldid}`      → newid
const newIdByIdent = new Map<string, string>();   // `${Type}?${sys}|${val}` → newid
const newIdByUrn = new Map<string, { type: string; newid: string }>(); // oldid → {type,newid}

function primaryId(resource: any, T: string, oldid: string): string {
    const idents = Array.isArray(resource.identifier) ? resource.identifier : [];
    const p = idents.find((i: any) => i?.system && i?.value);
    return p ? uuid5(`${T}|${p.system}|${p.value}`) : uuid5(`${T}|${oldid}`);
}

console.log("pass A — building id maps…");
let total = 0;
for (const { table_name } of tables) {
    const rows: any[] = await sql.unsafe(`SELECT id, resource->>'resourceType' AS rt, resource->'identifier' AS idents FROM fhir.${table_name}`);
    for (const r of rows) {
        const T = r.rt as string;
        const oldid = r.id as string;
        const idents = Array.isArray(r.idents) ? r.idents : [];
        const p = idents.find((i: any) => i?.system && i?.value);
        const newid = p ? uuid5(`${T}|${p.system}|${p.value}`) : uuid5(`${T}|${oldid}`);
        newIdByOrig.set(`${T}/${oldid}`, newid);
        newIdByUrn.set(oldid, { type: T, newid });
        for (const i of idents) if (i?.system && i?.value) newIdByIdent.set(`${T}?${i.system}|${i.value}`, newid);
        total++;
    }
}
console.log(`  ${total} resources, ${newIdByIdent.size} identifier keys`);

// ── reference rewriting ─────────────────────────────────────────────────────
function rewriteRef(ref: string): string {
    let m = ref.match(/^([A-Za-z]+)\?identifier=([^|]+)\|(.+)$/); // conditional
    if (m) {
        const [, T2, sys, val] = m;
        const key = newIdByIdent.get(`${T2}?${sys}|${val}`) ?? uuid5(`${T2}|${sys}|${val}`);
        return `${T2}/${key}`;
    }
    m = ref.match(/^([A-Za-z]+)\/(.+)$/); // literal Type/id
    if (m) {
        const [, T2, id] = m;
        return `${T2}/${newIdByOrig.get(`${T2}/${id}`) ?? id}`;
    }
    m = ref.match(/^urn:uuid:(.+)$/); // bundle-internal
    if (m) {
        const e = newIdByUrn.get(m[1]!);
        return e ? `${e.type}/${e.newid}` : ref;
    }
    return ref;
}
function walk(o: any): void {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o.reference === "string") o.reference = rewriteRef(o.reference);
    for (const v of Object.values(o)) walk(v);
}

// ── Pass B: rewrite ids + refs, swap tables ─────────────────────────────────
console.log("pass B — rewriting resources…");
for (const { table_name } of tables) {
    const rows: any[] = await sql.unsafe(`SELECT id, resource FROM fhir.${table_name}`);
    if (!rows.length) continue;
    const out: [string, string][] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        const res = r.resource;
        const T = res.resourceType as string;
        const newid = newIdByOrig.get(`${T}/${r.id}`) ?? r.id;
        res.id = newid;
        walk(res);
        if (seen.has(newid)) continue; // dedup collisions (same identifier)
        seen.add(newid);
        out.push([newid, JSON.stringify(res)]);
    }
    // Rewrite in place: TRUNCATE then re-insert with INLINE jsonb literals
    // (Bun.SQL double-encodes a stringified-JSON param bound to ::jsonb — see
    // CLAUDE.md — so we inline the JSON and let ::jsonb parse it server-side).
    const q = (s: string) => s.replaceAll("'", "''");
    await sql.unsafe(`TRUNCATE fhir.${table_name}`);
    const CHUNK = 500;
    for (let i = 0; i < out.length; i += CHUNK) {
        const vals = out.slice(i, i + CHUNK)
            .map(([id, json]) => `('${q(id)}', '${q(json)}'::jsonb)`).join(",");
        await sql.unsafe(`INSERT INTO fhir.${table_name} (id, resource) VALUES ${vals}`);
    }
    console.log(`  fhir.${table_name}: ${out.length} rows`);
}

console.log("done — references normalized to uuid5 surrogate ids.");
await sql.end();
