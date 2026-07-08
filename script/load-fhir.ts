#!/usr/bin/env bun
// Load FHIR Bundle .json files into Postgres as fhir.<resource_type>(id, resource jsonb).
//
// Usage:
//   bun script/load-fhir.ts path/to/fhir-bundles/           # a directory of FHIR R4 Bundle .json
//   bun script/load-fhir.ts path/to/one-bundle.json         # a single Bundle file
//
// Source-agnostic: point it at ANY directory of FHIR R4 bundles (an EHR FHIR
// dump, a Synthea export, hand-authored fixtures). The pipeline downstream
// (etl-all.ts) doesn't care where the FHIR came from.
//
// Auth: connects via $ATHENA_DSN or postgresql://athena:athena@localhost:54392/athena
//
// Re-running is safe — INSERTs use ON CONFLICT (id) DO UPDATE.

import { statSync } from "node:fs";
import init from "../src/fhir/init";
import loadBundle from "../src/fhir/loadBundle";
import loadDir from "../src/fhir/loadDir";

const arg = process.argv[2];
if (!arg) {
    console.error("usage: bun script/load-fhir.ts <dir-of-fhir-bundles | one-bundle.json> [--normalize]");
    process.exit(2);
}
const ctx = { env: process.env } as any;

if (statSync(arg).isDirectory()) {
    const result = await loadDir(ctx, { dir: arg });
    console.log(JSON.stringify({ files: result.files, inserted: result.inserted, skipped: result.skipped }, null, 2));
} else {
    await init(ctx);
    const result = await loadBundle(ctx, { path: arg });
    console.log(JSON.stringify(result, null, 2));
}

// --normalize: resolve conditional/identifier references to deterministic uuid5
// surrogate ids so foreign keys line up (needed for e.g. Synthea, which
// references serviceProvider/participant by identifier, not by resource id).
// Global pass over all of fhir.*, so run it once after the whole dataset loads.
if (process.argv.includes("--normalize")) {
    console.log("normalizing references (identifier/conditional → uuid5)…");
    const p = Bun.spawn(["bun", "script/normalize-refs.ts"], { stdout: "inherit", stderr: "inherit" });
    if ((await p.exited) !== 0) process.exit(1);
}

process.exit(0);
