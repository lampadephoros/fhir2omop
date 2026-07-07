# F2O Connectathon 2026 - Sample FHIR Fixture Pack (first pass)

**FHIR version:** R4, base profiles, unprofiled
**Vocabulary baseline:** OHDSI release 20260227, served by the WG terminology server (https://fhir-terminology.ohdsi.org)
**CDM target:** OMOP CDM v5.4 (CSV output)
**Architecture:** three-workflow model; this pack is authoritative for the Workflow 1 reference run and reusable as a self-test for Workflows 2 and 3.

## What is in this pack

A deliberately minimal ("stingy") set of FHIR resources: the fewest patients and visits that
still exercise the conformance tests, including designed-to-fail resources for the Must-tier
statements. Every conformant code resolves to a standard OMOP concept on the WG terminology
server; the one deliberately unmapped code drives the concept_id = 0 fallback test.

File names are prefixed with the FHIR resource type (per C. Roeder).

## Roster: 4 patients, 6 encounters

| Patient | Role | Encounters |
|---|---|---|
| patient_01_complex | Main conformant workhorse: conditions, labs, vitals, procedure, med | e1 outpatient, e2 inpatient |
| patient_02_immuno_allergy | Immunization, patient-reported med | e3 outpatient |
| patient_03_unmapped | Unmapped-fallback + residual-content (note) | e4 outpatient |
| patient_04_negative | ISOLATED Must-tier fail twins (keeps baseline clean) | e5, e6 outpatient |

## Folder tree

```
fixtures/
  patient/            4 patients
  encounter/          6 encounters
  condition/          5 (4 mapped + 1 unmapped-by-design)
  observation/        4 measurements (LOINC + UCUM units)
  procedure/          1
  medicationrequest/  1 (active)
  medicationstatement/1 (patient-reported, f2o-053)
  immunization/       1 (CVX)
  documentreference/  1 (residual content -> note, f2o-081)
  _negative/          5 Must-tier fail twins
```

## Negative (Must-tier) fixtures and what they prove

| File | Statement | Expected disposition |
|---|---|---|
| medicationrequest_p4_cancelled_NEG_f2o-060.json | f2o-060 | EXCLUDED (status=cancelled) |
| procedure_p4_notdone_NEG_f2o-060.json | f2o-060 | EXCLUDED (status=not-done) |
| condition_p4_identifier_leak_NEG_f2o-020.json | f2o-020 | INCLUDED, but MRN identifier must never reach a source_value field |
| observation_p4_nodate_NEG_f2o-070.json | f2o-070/071 | EXCLUDED or imputed with documented strategy; no silent date |
| condition_p4_missing_subject_NEG_f2o-012.json | f2o-012 | REJECTED/QUARANTINED (invalid FHIR: no subject) |

## Validation status

- **FHIR gate (OFFICIAL):** validated with the HL7 validator_cli.jar v6.9.9 against base R4
  (4.0.1). All conformant fixtures return Success (0 errors); the only design-failures are the
  1 invalid-FHIR negative (f2o-012, missing subject) and the local-code resolution warning.
  Three findings from the first official run were corrected: the CVX 140 display name was set
  to the validator-approved 'Influenza, split virus, trivalent, PF'; the unmapped local code
  system was changed from an example.org URL to http://institution.local/lab-codes; and the
  blood-pressure observation was remodeled as a proper BP panel (LOINC 85354-9) with systolic
  and diastolic components, plus a separate simple sodium measurement was added.
  Note: dom-6 ('should have narrative') and 'performer' warnings are expected best-practice
  advisories on raw transformation inputs and are not defects.
- **Terminology gate:** all conformant source codes verified against the WG terminology server
  (vocab 20260227); resolved standard concept_ids are recorded in expected_results.json.

## Companion files

- `test_register.csv` - one row per (test, statement); 37 rows, 13 distinct f2o statements
  covered by fixtures in this first pass.
- `expected_results.json` - the gold answer key: expected OMOP output per fixture, with the
  four version pins in the header (CDM 5.4, vocab 20260227, IG version, engine version).
- `validate_fhir.py` - the FHIR validation gate (re-runnable).

## Statements covered by fixtures in this pass

f2o-012, f2o-020, f2o-031, f2o-032, f2o-033, f2o-034, f2o-037, f2o-053, f2o-060, f2o-070,
f2o-071, f2o-072, f2o-081.

DQD-covered structural statements (f2o-001, f2o-021, f2o-090, f2o-100, f2o-122) are evidenced
by the DQD check subset on the output, not by individual fixtures. Attestation-only statements
are out of scope for fixtures per the leads decision.

## Known open items

- `{IG_VERSION_PINNED}` in the answer-key header awaits the pinned IG snapshot.
- Type-concept-id values for patient-reported data (f2o-053) and the immunization/visit type
  concepts are implementation-resolved against the published type-concept value sets.
- The official HL7 validator_cli.jar could not be fetched in the build sandbox (its CDN host
  is outside the egress allowlist); base R4 validation was performed with the fhir.resources
  R4B models instead. Re-running against validator_cli.jar in an unrestricted environment is
  recommended before ship as a belt-and-suspenders check.
