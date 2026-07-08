#!/usr/bin/env bun
// Generate Data-Quality checks as SQLQuery-Library resources, per
// HL7/sql-on-fhir#375: each check is a Library(type=sqlquery) whose SQL returns
// the FAILING rows (zero rows = pass), plus a thin DataQualityCheck profile of
// metadata (Kahn category, check type, threshold, severity). This ports the
// OHDSI DQD check families to our FHIR-native "sql query library" over the OMOP
// tables our pipeline produces (cdm_ours_fhir.*), driven by the OMOP CDM v5.4
// field-level catalog.
//
//   bun script/gen-dqchecks.ts        # → mapspec/dqchecks/*.sqlquery.json
import { parse } from "csv-parse/sync";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";

const CATALOG = "CommonDataModel/inst/csv/OMOP_CDMv5.4_Field_Level.csv";
const OUT = "mapspec/dqchecks";
const EXT = "https://fhir2omop.health-samurai.io/StructureDefinition";

// OMOP tables our FHIR→OMOP pipeline actually populates (cdm_ours_fhir.*).
const OUR_TABLES = new Set([
    "person", "observation_period", "visit_occurrence", "condition_occurrence",
    "drug_exposure", "procedure_occurrence", "device_exposure", "measurement",
    "observation", "death", "note", "specimen", "location", "care_site",
    "provider", "payer_plan_period",
]);

const rows: any[] = parse(readFileSync(CATALOG, "utf8"), { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let n = 0;
function emit(id: string, title: string, kahn: string, checkType: string, thresholdPct: number, severity: string, table: string, field: string | null, sql: string) {
    const lib = {
        resourceType: "Library",
        id,
        url: `${EXT}/Library/${id}`,
        name: id.replaceAll("-", "_"),
        title,
        status: "active",
        type: { coding: [{ system: "http://hl7.org/fhir/uv/sql-on-fhir/CodeSystem/library-type", code: "sqlquery" }] },
        // DataQualityCheck profile metadata (thin, per sql-on-fhir#375)
        extension: [
            { url: `${EXT}/dq-kahn-category`, valueCode: kahn },              // conformance | completeness | plausibility
            { url: `${EXT}/dq-check-type`, valueString: checkType },          // DQD check name
            { url: `${EXT}/dq-threshold-pct`, valueDecimal: thresholdPct },   // max % failing rows to still pass
            { url: `${EXT}/dq-severity`, valueCode: severity },               // error | warning
        ],
        parameter: [
            { name: "cdmTable", use: "in", valueString: table },
            ...(field ? [{ name: "cdmField", use: "in", valueString: field }] : []),
        ],
        // SoF SQLQuery content: SQL returning FAILING rows (stored as text for
        // repo-readability rather than base64).
        content: [{ contentType: "text/sql", data: sql }],
    };
    writeFileSync(`${OUT}/${id}.sqlquery.json`, JSON.stringify(lib, null, 2) + "\n");
    n++;
}

for (const r of rows) {
    const table = String(r.cdmTableName || "").toLowerCase();
    const field = String(r.cdmFieldName || "").toLowerCase();
    if (!OUR_TABLES.has(table)) continue;
    const T = `cdm_ours_fhir.${table}`;
    const yes = (v: any) => String(v).toLowerCase() === "yes";

    // 1. Conformance — required field must not be NULL (DQD cdmNotNullable/isRequired).
    if (yes(r.isRequired)) {
        emit(`dq-notnull-${table}-${field}`,
            `${table}.${field} SHALL NOT be NULL`, "conformance", "cdmNotNullable", 0, "error", table, field,
            `SELECT * FROM ${T} WHERE ${field} IS NULL`);
    }

    // 2. Conformance — primary key must be unique (DQD isPrimaryKey).
    if (yes(r.isPrimaryKey)) {
        emit(`dq-pk-${table}-${field}`,
            `${table}.${field} SHALL be unique (primary key)`, "conformance", "isPrimaryKey", 0, "error", table, field,
            `SELECT ${field} FROM ${T} GROUP BY ${field} HAVING COUNT(*) > 1`);
    }

    // 3. Conformance — foreign key must resolve (DQD isForeignKey). Concept FKs
    // point at vocab.concept; concept_id 0 is a valid "no concept" sentinel.
    if (yes(r.isForeignKey) && r.fkTableName) {
        const fkTable = String(r.fkTableName).toLowerCase();
        const fkField = String(r.fkFieldName || "concept_id").toLowerCase();
        const fkRef = fkTable === "concept" ? `vocab.concept` : `cdm_ours_fhir.${fkTable}`;
        emit(`dq-fk-${table}-${field}`,
            `${table}.${field} SHALL reference an existing ${fkTable}.${fkField}`, "conformance", "isForeignKey", 0, "error", table, field,
            `SELECT a.* FROM ${T} a WHERE a.${field} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${fkRef} b WHERE b.${fkField} = a.${field})`);

        // 3b. Completeness — standard *_concept_id unmapped rate (concept_id = 0).
        // Only the standard target field (not *_source_concept_id / *_type_concept_id).
        if (field.endsWith("_concept_id") && !field.endsWith("_source_concept_id") && !field.endsWith("_type_concept_id") && fkTable === "concept") {
            emit(`dq-mapped-${table}-${field}`,
                `${table}.${field} mapped to a non-zero concept (completeness)`, "completeness", "conceptRecordCompleteness", 5, "warning", table, field,
                `SELECT * FROM ${T} WHERE ${field} = 0`);
        }
    }
}

// 4. Plausibility — event start SHALL NOT be after end (DQD plausibleStartBeforeEnd).
const START_END: [string, string, string][] = [
    ["condition_occurrence", "condition_start_date", "condition_end_date"],
    ["drug_exposure", "drug_exposure_start_date", "drug_exposure_end_date"],
    ["procedure_occurrence", "procedure_date", "procedure_end_date"],
    ["device_exposure", "device_exposure_start_date", "device_exposure_end_date"],
    ["visit_occurrence", "visit_start_date", "visit_end_date"],
    ["observation_period", "observation_period_start_date", "observation_period_end_date"],
    ["payer_plan_period", "payer_plan_period_start_date", "payer_plan_period_end_date"],
];
for (const [table, s, e] of START_END) {
    emit(`dq-startend-${table}`,
        `${table}: ${s} SHALL NOT be after ${e}`, "plausibility", "plausibleStartBeforeEnd", 0, "error", table, null,
        `SELECT * FROM cdm_ours_fhir.${table} WHERE ${e} IS NOT NULL AND ${s} > ${e}`);
}

// 5. Plausibility — sex-specific concept on the wrong gender (DQD
// plausibleGender + plausibleGenderUseDescendants), from the OHDSI concept-level
// catalog vendored as _concept_gender.tsv. Reproduces the F2O WG's predicted
// implausible-gender signals (e.g. BPH / prostate on female patients).
const genderRows = readFileSync("mapspec/dq_concept_gender.tsv", "utf8").split("\n").filter(Boolean)
    .map((l) => l.split("\t"));  // [cdmTable, cdmField, conceptId, gender, useDescFlag]
const maleIds = [...new Set(genderRows.filter((r) => r[3] === "Male").map((r) => r[2]))];
const femaleIds = [...new Set(genderRows.filter((r) => r[3] === "Female").map((r) => r[2]))];
const GENDER_TABLES: [string, string][] = [
    ["condition_occurrence", "condition_concept_id"],
    ["procedure_occurrence", "procedure_concept_id"],
];
for (const [table, field] of GENDER_TABLES) {
    const T = `cdm_ours_fhir.${table}`;
    // 8507 = MALE gender, 8532 = FEMALE gender
    // Direct (parent-level) sex-specific concept check. NOTE: this uses the full
    // OHDSI plausibleGender catalog, so on a seeded dataset it flags the WG's
    // deliberate implausible rows (e.g. BPH 198803 on female) *and* any other
    // sex-specific concept present — a superset of the WG's narrow predicted
    // count, not an exact reproduction. The descendant-rollup variant
    // (plausibleGenderUseDescendants) is intentionally omitted: the OHDSI catalog
    // encodes its use-descendants concepts as multi-id quoted fields that don't
    // parse cleanly, and a naive rollup over all 287 concepts over-reaches.
    emit(`dq-gender-${table}`,
        `${table}.${field}: sex-specific concept on the wrong gender`, "plausibility", "plausibleGender", 0, "warning", table, field,
        `SELECT t.* FROM ${T} t JOIN cdm_ours_fhir.person p ON p.person_id = t.person_id
         WHERE (t.${field} IN (${maleIds.join(",")})   AND p.gender_concept_id = 8532)
            OR (t.${field} IN (${femaleIds.join(",")}) AND p.gender_concept_id = 8507)`);
}

// 6. Completeness — measurement/observation with no value at all (DQD
// measureValueCompleteness). Reproduces the F2O WG dataAbsentReason signal.
const VALUE_TABLES: [string, string][] = [["measurement", "value_as_number"], ["observation", "value_as_number"]];
for (const [table] of VALUE_TABLES) {
    emit(`dq-value-${table}`,
        `${table}: row carries no value (value_as_number / value_as_concept_id / value_source_value all null)`, "completeness", "measureValueCompleteness", 5, "warning", table, null,
        `SELECT * FROM cdm_ours_fhir.${table} WHERE value_as_number IS NULL AND value_as_concept_id IS NULL AND value_source_value IS NULL`);
}

console.log(`wrote ${n} SQLQuery-Library DQ checks → ${OUT}/`);
