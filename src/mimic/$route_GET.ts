// GET /mimic — browser for the MIMIC-IV research schemas (see docs/mimic-analyses.md).
// Lists every table in the four mimic_* schemas with exact row counts; each
// table links to /mimic/:schema/:table (sample-row viewer).

const SCHEMAS: { name: string; blurb: string }[] = [
    { name: "mimic_src", blurb: "ORIGINAL MIMIC-IV Clinical Database Demo v2.2 (PhysioNet, relational CSVs; hosp + icu modules, all-text columns) — the source both derived demos were converted from" },
    { name: "mimic_fhir", blurb: "Raw MIMIC-IV-on-FHIR demo resources (id + jsonb), loaded from PhysioNet ndjson" },
    { name: "mimic_stg", blurb: "Stage-1 ViewDefinition materializations + _resolve_* outputs for the MIMIC run" },
    { name: "mimic_cdm", blurb: "OUR FHIR→OMOP converter output (compare against mimic_omop)" },
    { name: "mimic_omop", blurb: "Reference oracle: MIMIC-IV demo in OMOP CDM v0.9 (independent OHDSI ETL, text columns)" },
];

const IDENT = /^[a-z_][a-z0-9_]*$/;

// Original MIMIC-IV table descriptions (hosp + icu modules of the demo).
// Cross-references to the derived demos are noted where we verified them
// (chartevents 668,862 = MimicObservationChartevents; diagnoses_icd 4,506 =
// MimicCondition; labevents 107,727 = mimic_fhir.observation).
const SRC_META: Record<string, { desc: string }> = {
    // hosp module — hospital-wide EHR data
    patients: { desc: "hosp · Patients: gender, anchor_age/anchor_year (date-shift anchor), dod" },
    admissions: { desc: "hosp · Hospital admissions (hadm_id): admit/discharge time, admission_type/location, discharge_location, insurance, race" },
    transfers: { desc: "hosp · Ward transfers: careunit history per admission" },
    services: { desc: "hosp · Hospital service (MED, SURG, …) per admission over time" },
    diagnoses_icd: { desc: "hosp · Billing diagnoses (ICD-9/10-CM, dotless, seq_num) → MimicCondition 1:1 → ref OMOP type 32821" },
    d_icd_diagnoses: { desc: "hosp · ICD diagnosis code dictionary (icd_code, icd_version, long_title)" },
    procedures_icd: { desc: "hosp · Billing procedures (ICD-9-Proc / ICD-10-PCS, dotless)" },
    d_icd_procedures: { desc: "hosp · ICD procedure code dictionary" },
    drgcodes: { desc: "hosp · DRG billing codes per admission (HCFA/APR)" },
    hcpcsevents: { desc: "hosp · HCPCS-billed events" },
    d_hcpcs: { desc: "hosp · HCPCS code dictionary" },
    labevents: { desc: "hosp · Lab results keyed by itemid (no LOINC) → MimicObservation (mimic-d-labitems) → measurement" },
    d_labitems: { desc: "hosp · Lab item dictionary (itemid, label, fluid, category)" },
    microbiologyevents: { desc: "hosp · Microbiology: specimens, organisms, antibiotic susceptibilities (local codes)" },
    prescriptions: { desc: "hosp · Prescriptions: drug name, NDC/GSN/formulary codes, route → MimicMedicationRequest" },
    pharmacy: { desc: "hosp · Pharmacy orders (medication, frequency, dispensation)" },
    emar: { desc: "hosp · eMAR: medication administration records" },
    emar_detail: { desc: "hosp · eMAR dose-level detail" },
    poe: { desc: "hosp · Provider order entry: order lifecycle" },
    poe_detail: { desc: "hosp · POE detail rows (key/value per order)" },
    omr: { desc: "hosp · Outpatient measurement results: BP, weight, BMI as text values" },
    provider: { desc: "hosp · Provider id registry (deidentified npi-like ids)" },
    // icu module — bedside charting from MetaVision
    icustays: { desc: "icu · ICU stays (stay_id): intime/outtime, careunit" },
    chartevents: { desc: "icu · Bedside charting by itemid (vitals, Heart Rhythm 220048, …) — source of the 12,608 rhythm rows in ref condition_occurrence" },
    d_items: { desc: "icu · ICU item dictionary (itemid, label, category, param_type)" },
    inputevents: { desc: "icu · IV / infusion inputs (amount, rate, ordercategory)" },
    ingredientevents: { desc: "icu · Ingredient breakdown of inputs (e.g. water content)" },
    outputevents: { desc: "icu · Outputs: urine, drains, … (value + unit per itemid)" },
    procedureevents: { desc: "icu · ICU procedures charted in MetaVision (ventilation, lines, …)" },
    datetimeevents: { desc: "icu · Datetime-valued charted items (e.g. last dialysis)" },
    caregiver: { desc: "icu · Caregiver id registry" },
};

// Per-table annotations for mimic_stg: the schema mixes the real pipeline
// output (stage-1 ViewDefinition materializations + _resolve_* passes over the
// ORIGINAL MIMIC-on-FHIR resources) with scratch tables left by the validation
// session (docs/mimic-analyses.md) — crosswalk loads, natural-key bridges,
// comparison temps. Scratch is listed separately and dimmed.
const STG_META: Record<string, { desc: string; scratch?: boolean }> = {
    // pipeline: stage-1 views over original MIMIC FHIR resources
    patient_person: { desc: "Patient stage-1 view (Patient__person.view.json)" },
    encounter_visit: { desc: "Encounter stage-1 view (Encounter__visit_occurrence.view.json)" },
    condition_occurrence: { desc: "Condition stage-1 view — one row per coding (code_system/code_value)" },
    observation_coded: { desc: "Observation stage-1 view — per-coding fan-out (labevents; mimic-d-labitems itemids)" },
    procedure_coded: { desc: "Procedure stage-1 view — per-coding fan-out" },
    procedure_occurrence: { desc: "Procedure stage-1 view — canonical max-column variant" },
    medicationrequest_drug_exposure: { desc: "MedicationRequest stage-1 view (inline code slots only — no medicationReference deref at run time)" },
    specimen_specimen: { desc: "Specimen stage-1 view (Specimen__specimen.view.json)" },
    // pipeline: shared resolve passes (_resolve_*.sql)
    condition_resolved: { desc: "_resolve_condition.sql output — vocab walk + std_domain routing (ICD via dot/system bridge)" },
    observation_resolved: { desc: "_resolve_observation.sql output — itemid→LOINC via temp crosswalk, std_domain routed" },
    procedure_resolved: { desc: "_resolve_procedure.sql output — ICD-9-Proc resolved (ICD-10-PCS vocab absent from bundle)" },
    medreq_resolved: { desc: "Resolved drug codes for MedicationRequest (NDC → RxNorm standard)" },
    // analysis scratch: crosswalk loads (OHDSI/MIMIC gcpt_*.csv)
    cw_lab_raw: { desc: "Raw gcpt_meas_lab_loinc_mod.csv as loaded (itemid→LOINC crosswalk source)", scratch: true },
    cm_lab_itemid: { desc: "Flattened lab crosswalk: itemid → src/std concept_id (temp cm-style table)", scratch: true },
    micro_specimen_cw: { desc: "Raw gcpt_micro_specimen.csv crosswalk (micro specimen codes → SNOMED)", scratch: true },
    // analysis scratch: comparison bridges & temps
    person_bridge: { desc: "Bridge our person_id ↔ MIMIC subject_id (via Patient.identifier)", scratch: true },
    enc_bridge: { desc: "Encounter natural-key bridge (enc uuid → subject_id, start, class)", scratch: true },
    enc_nat: { desc: "Encounter natural keys + our visit_concept (local vs UTC date probe)", scratch: true },
    enc_nat2: { desc: "Encounter natural keys v2 — join on subject_id|hadm_id", scratch: true },
    enc_cmp: { desc: "visit_concept_id comparison ours vs reference per encounter", scratch: true },
    ours_bridged: { desc: "Our drug_exposure on natural keys (subject_id, NDC) for diffing", scratch: true },
    ref_bridged: { desc: "Reference drug_exposure on natural keys (subject_id, NDC) for diffing", scratch: true },
    medreq_adapted: { desc: "Adapted MedicationRequest view — medicationReference deref experiment (pre-fix)", scratch: true },
};

export default async function (ctx: Context, _session: any, _req: Request) {
    const tables: { table_schema: string; table_name: string; cols: number }[] =
        await ctx.fns.db.query(ctx, {
            sql: `SELECT t.table_schema, t.table_name,
                         (SELECT count(*)::int FROM information_schema.columns c
                           WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS cols
                  FROM information_schema.tables t
                  WHERE t.table_schema IN (${SCHEMAS.map((s) => `'${s.name}'`).join(", ")})
                    AND t.table_type = 'BASE TABLE'
                  ORDER BY t.table_schema, t.table_name`,
        });

    // Exact counts — mimic demo tables top out at ~105k rows, this stays subsecond.
    const counts = new Map<string, number>();
    for (const t of tables) {
        if (!IDENT.test(t.table_schema) || !IDENT.test(t.table_name)) continue;
        const r = await ctx.fns.db.query(ctx, {
            sql: `SELECT count(*)::int AS n FROM "${t.table_schema}"."${t.table_name}"`,
        });
        counts.set(`${t.table_schema}.${t.table_name}`, r[0]?.n ?? 0);
    }

    const sections = SCHEMAS.map((s) => {
        const own = tables.filter((t) => t.table_schema === s.name);
        if (!own.length) return `<div class="not-prose mb-6">
  <h2 class="text-lg font-semibold text-gray-800">${esc(s.name)}</h2>
  <div class="text-xs text-gray-500 mb-2">${esc(s.blurb)}</div>
  <div class="text-sm text-gray-400 italic">no tables (schema not loaded)</div>
</div>`;
        const meta = s.name === "mimic_stg" ? STG_META : s.name === "mimic_src" ? SRC_META : null;
        const renderRows = (list: typeof own, dim: boolean) => list.map((t) => {
            const n = counts.get(`${t.table_schema}.${t.table_name}`) ?? 0;
            const d = meta?.[t.table_name]?.desc ?? "";
            const tone = dim ? "text-gray-400" : "text-blue-700";
            return `<tr class="border-b border-gray-100 hover:bg-gray-50${dim ? " opacity-70" : ""}">
  <td class="px-2 py-1.5 whitespace-nowrap"><a href="/mimic/${enc(t.table_schema)}/${enc(t.table_name)}" class="font-mono text-sm ${tone} hover:underline">${esc(t.table_name)}</a></td>
  ${meta ? `<td class="px-2 py-1.5 text-xs text-gray-500">${esc(d)}</td>` : ""}
  <td class="px-2 py-1.5 text-right font-mono text-xs text-gray-600">${n.toLocaleString("en-US")}</td>
  <td class="px-2 py-1.5 text-right font-mono text-xs text-gray-400">${t.cols}</td>
</tr>`;
        }).join("\n");
        const tableFor = (list: typeof own, dim: boolean) => `<table class="w-full ${meta ? "" : "max-w-2xl "}text-left border border-gray-200 rounded">
    <thead><tr class="bg-gray-50 text-xs text-gray-500">
      <th class="px-2 py-1.5 font-medium">table</th>
      ${meta ? `<th class="px-2 py-1.5 font-medium">description</th>` : ""}
      <th class="px-2 py-1.5 font-medium text-right">rows</th>
      <th class="px-2 py-1.5 font-medium text-right">cols</th>
    </tr></thead>
    <tbody>${renderRows(list, dim)}</tbody>
  </table>`;
        const total = own.reduce((a, t) => a + (counts.get(`${t.table_schema}.${t.table_name}`) ?? 0), 0);
        let body: string;
        if (s.name === "mimic_stg" && meta) {
            const pipeline = own.filter((t) => !(meta as typeof STG_META)[t.table_name]?.scratch);
            const scratch = own.filter((t) => (meta as typeof STG_META)[t.table_name]?.scratch);
            body = `<div class="text-xs font-semibold text-gray-600 mt-2 mb-1">Pipeline — stage-1 views + resolve passes over the original MIMIC FHIR resources</div>
  ${tableFor(pipeline, false)}
  <details class="mt-3">
    <summary class="cursor-pointer text-xs font-semibold text-gray-400">Analysis scratch — validation-session temps (crosswalk loads, diff bridges) · ${scratch.length} tables</summary>
    <div class="mt-1">${tableFor(scratch, true)}</div>
  </details>`;
        } else if (s.name === "mimic_src" && meta) {
            const mod = (t: { table_name: string }) => (meta[t.table_name]?.desc ?? "").startsWith("icu") ? "icu" : "hosp";
            const hosp = own.filter((t) => mod(t) === "hosp");
            const icu = own.filter((t) => mod(t) === "icu");
            body = `<div class="text-xs font-semibold text-gray-600 mt-2 mb-1">hosp module — hospital-wide EHR (${hosp.length} tables)</div>
  ${tableFor(hosp, false)}
  <div class="text-xs font-semibold text-gray-600 mt-3 mb-1">icu module — bedside charting (${icu.length} tables)</div>
  ${tableFor(icu, false)}`;
        } else {
            body = tableFor(own, false);
        }
        return `<div class="not-prose mb-8">
  <h2 class="text-lg font-semibold text-gray-800">${esc(s.name)}
    <span class="text-xs font-normal text-gray-400 ml-2">${own.length} tables · ${total.toLocaleString("en-US")} rows</span>
  </h2>
  <div class="text-xs text-gray-500 mb-2">${esc(s.blurb)}</div>
  ${body}
</div>`;
    }).join("\n");

    const main = `<div class="not-prose mb-4">
  <h1 class="text-2xl font-bold text-gray-900">MIMIC-IV demo schemas</h1>
  <div class="text-sm text-gray-500 mt-1">
    100-patient open demo; input FHIR vs our converter output vs the independent OHDSI reference.
    Analysis: <a href="/source?path=docs/mimic-analyses.md" class="text-blue-600 hover:underline">docs/mimic-analyses.md</a>
  </div>
</div>
${sections}`;

    return { title: "MIMIC schemas", current: "mimic", main };
}

function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function enc(s: string) {
    return encodeURIComponent(s);
}
