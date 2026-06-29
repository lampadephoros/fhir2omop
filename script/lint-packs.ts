#!/usr/bin/env bun
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let exitCode = 0;

function logError(msg: string) {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
    exitCode = 1;
}

function logSuccess(msg: string) {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`);
}

const packsDir = resolve(import.meta.dir, "..", "packs", "specialty");
const casesDir = resolve(import.meta.dir, "..", "cases");

if (!existsSync(packsDir)) {
    logError(`Packs directory does not exist: ${packsDir}`);
    process.exit(1);
}

const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

if (packDirs.length === 0) {
    logError("No specialty packs found.");
    process.exit(1);
}

for (const dirName of packDirs) {
    const packJsonPath = resolve(packsDir, dirName, "pack.json");
    if (!existsSync(packJsonPath)) {
        logError(`Pack directory '${dirName}' is missing 'pack.json'`);
        continue;
    }

    try {
        const content = JSON.parse(await Bun.file(packJsonPath).text());
        
        // Manual Schema Validation (matching packs/schema/pack.schema.json)
        if (typeof content !== "object" || content === null) {
            logError(`${dirName}/pack.json: Must be a JSON object`);
            continue;
        }

        const { name, title, description, cases } = content;

        if (typeof name !== "string" || !/^[a-z0-9-]+$/.test(name)) {
            logError(`${dirName}/pack.json: 'name' must be a kebab-case string`);
        }
        if (name !== dirName) {
            logError(`${dirName}/pack.json: 'name' (${name}) must match the directory name (${dirName})`);
        }
        if (typeof title !== "string" || title.trim() === "") {
            logError(`${dirName}/pack.json: 'title' must be a non-empty string`);
        }
        if (typeof description !== "string" || description.trim() === "") {
            logError(`${dirName}/pack.json: 'description' must be a non-empty string`);
        }
        if (!Array.isArray(cases)) {
            logError(`${dirName}/pack.json: 'cases' must be an array of strings`);
            continue;
        }

        // Validate each referenced case file
        for (const caseFile of cases) {
            if (typeof caseFile !== "string" || !/^[a-z0-9-]+--[a-z0-9-]+--[a-z0-9-]+\.json$/.test(caseFile)) {
                logError(`${dirName}/pack.json: case filename '${caseFile}' must match the pattern '<resource>--<table>--<aspect>.json'`);
                continue;
            }

            const caseFilePath = resolve(casesDir, caseFile);
            if (!existsSync(caseFilePath)) {
                logError(`${dirName}/pack.json: Referenced case file does not exist: '${caseFile}'`);
            }
        }
    } catch (e: any) {
        logError(`Failed to parse ${dirName}/pack.json: ${e.message}`);
    }
}

if (exitCode === 0) {
    logSuccess("All specialty packs passed validation!");
}
process.exit(exitCode);
