// Shared FHIR→OMOP edge plan, used by both the full-cohort orchestrator
// (script/etl-all.ts) and the per-case test runner (script/run-cases.ts).
//
//   mode 'truncate'  → TRUNCATE target before INSERT (first edge writing to it)
//   mode 'append'    → APPEND to target (sibling edges)
//   mode 'update'    → run as-is (PractitionerRole's UPDATE-via-CTE)
//
// Order matters: per-target, the first edge truncates, subsequent append.
export type Edge = { edge: string; src: string; staging: string; target: string; mode: "truncate" | "append" | "update" };

export const PLAN: Edge[] = [
    // — core dimension tables —
    { edge: "Practitioner__provider",                 src: "fhir.practitioner",          staging: "staging.practitioner_provider",                target: "cdm_ours_fhir.provider",             mode: "truncate" },
    { edge: "Organization__care_site",                src: "fhir.organization",          staging: "staging.organization_care_site",               target: "cdm_ours_fhir.care_site",            mode: "truncate" },
    { edge: "Location__care_site",                    src: "fhir.location",              staging: "staging.location_care_site",                   target: "cdm_ours_fhir.care_site",            mode: "append" },
    { edge: "Patient__location",                      src: "fhir.patient",               staging: "staging.patient_person",                       target: "cdm_ours_fhir.location",             mode: "truncate" },
    { edge: "Location__location",                     src: "fhir.location",              staging: "staging.location_location",                    target: "cdm_ours_fhir.location",             mode: "append" },
    { edge: "Patient__person",                        src: "fhir.patient",               staging: "staging.patient_person",                       target: "cdm_ours_fhir.person",               mode: "truncate" },

    // — visits (FK target for everything below) —
    { edge: "Encounter__visit_occurrence",            src: "fhir.encounter",             staging: "staging.encounter_visit",                      target: "cdm_ours_fhir.visit_occurrence",     mode: "truncate" },

    // — clinical events —
    { edge: "Condition__condition_occurrence",        src: "fhir.condition",             staging: "staging.condition_occurrence",                 target: "cdm_ours_fhir.condition_occurrence", mode: "truncate" },
    { edge: "Condition__fact_relationship",           src: "fhir.condition",             staging: "staging.condition_occurrence",                 target: "cdm_ours_fhir.fact_relationship",    mode: "truncate" },
    { edge: "Procedure__procedure_occurrence",        src: "fhir.procedure",             staging: "staging.procedure_occurrence",                 target: "cdm_ours_fhir.procedure_occurrence", mode: "truncate" },
    { edge: "DiagnosticReport__procedure_occurrence", src: "fhir.diagnostic_report",     staging: "staging.diagnosticreport_coded",               target: "cdm_ours_fhir.procedure_occurrence", mode: "append" },
    { edge: "Condition__procedure_occurrence",        src: "fhir.condition",             staging: "staging.condition_occurrence",                 target: "cdm_ours_fhir.procedure_occurrence", mode: "append" },

    { edge: "Observation__measurement",               src: "fhir.observation",           staging: "staging.observation_coded",                    target: "cdm_ours_fhir.measurement",          mode: "truncate" },
    { edge: "Observation_component__measurement",     src: "fhir.observation",           staging: "staging.observation_component",                target: "cdm_ours_fhir.measurement",          mode: "append" },
    { edge: "DiagnosticReport__measurement",          src: "fhir.diagnostic_report",     staging: "staging.diagnosticreport_coded",               target: "cdm_ours_fhir.measurement",          mode: "append" },
    { edge: "Condition__measurement",                 src: "fhir.condition",             staging: "staging.condition_occurrence",                 target: "cdm_ours_fhir.measurement",          mode: "append" },

    { edge: "Observation__observation",               src: "fhir.observation",           staging: "staging.observation_coded",                    target: "cdm_ours_fhir.observation",          mode: "truncate" },
    { edge: "Observation_component__observation",     src: "fhir.observation",           staging: "staging.observation_component",                target: "cdm_ours_fhir.observation",          mode: "append" },
    { edge: "AllergyIntolerance__observation",        src: "fhir.allergy_intolerance",   staging: "staging.allergyintolerance_observation",       target: "cdm_ours_fhir.observation",          mode: "append" },
    { edge: "DiagnosticReport__observation",          src: "fhir.diagnostic_report",     staging: "staging.diagnosticreport_coded",               target: "cdm_ours_fhir.observation",          mode: "append" },
    { edge: "Condition__observation",                 src: "fhir.condition",             staging: "staging.condition_occurrence",                 target: "cdm_ours_fhir.observation",          mode: "append" },

    { edge: "DiagnosticReport__note",                 src: "fhir.diagnostic_report",     staging: "staging.diagnosticreport_note",                target: "cdm_ours_fhir.note",                 mode: "truncate" },

    { edge: "MedicationRequest__drug_exposure",       src: "fhir.medication_request",    staging: "staging.medicationrequest_drug_exposure",      target: "cdm_ours_fhir.drug_exposure",        mode: "truncate" },
    { edge: "MedicationAdministration__drug_exposure",src: "fhir.medication_administration", staging: "staging.medicationadministration_drug_exposure", target: "cdm_ours_fhir.drug_exposure",   mode: "append" },
    { edge: "Immunization__drug_exposure",            src: "fhir.immunization",          staging: "staging.immunization_drug_exposure",           target: "cdm_ours_fhir.drug_exposure",        mode: "append" },
    { edge: "MedicationDispense__drug_exposure",      src: "fhir.medication_dispense",   staging: "staging.medicationdispense_drug_exposure",     target: "cdm_ours_fhir.drug_exposure",        mode: "append" },
    { edge: "MedicationStatement__drug_exposure",     src: "fhir.medication_statement",  staging: "staging.medicationstatement_drug_exposure",    target: "cdm_ours_fhir.drug_exposure",        mode: "append" },

    { edge: "Device__device_exposure",                src: "fhir.device",                staging: "staging.device_device_exposure",               target: "cdm_ours_fhir.device_exposure",      mode: "truncate" },
    { edge: "Specimen__specimen",                     src: "fhir.specimen",              staging: "staging.specimen_specimen",                    target: "cdm_ours_fhir.specimen",             mode: "truncate" },
    { edge: "Patient__death",                         src: "fhir.patient",               staging: "staging.patient_death",                        target: "cdm_ours_fhir.death",                mode: "truncate" },
    { edge: "Coverage__payer_plan_period",            src: "fhir.coverage",              staging: "staging.coverage_payer_plan_period",           target: "cdm_ours_fhir.payer_plan_period",    mode: "truncate" },

    // — derived (must run after visit_occurrence is populated) —
    { edge: "Patient__observation_period",            src: "fhir.patient",               staging: "staging.patient_observation_period",           target: "cdm_ours_fhir.observation_period",   mode: "truncate" },

    // — enrichments —
    { edge: "PractitionerRole__provider",             src: "fhir.practitioner_role",     staging: "staging.practitionerrole_provider",            target: "cdm_ours_fhir.provider",             mode: "update" },
];

// Total declared columns in a ViewDefinition (to pick the canonical
// max-column view when several edges share one staging table).
export function colCount(view: any): number {
    let n = 0;
    const walk = (s: any) => { n += (s.column ?? []).length; for (const c of s.select ?? []) walk(c); };
    for (const top of view.select ?? []) walk(top);
    return n;
}
