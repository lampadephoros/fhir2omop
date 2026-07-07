#!/usr/bin/env python3
"""FHIR R4(B) base validation gate for the F2O fixture set.
Confirms each fixture lands in its intended class:
  - conformant        -> must VALIDATE
  - valid_should_fail -> must VALIDATE (legal FHIR; transform handles it)
  - invalid_fhir      -> must FAIL validation (exercises f2o-012)
"""
import json, pathlib, importlib, sys

ROOT = pathlib.Path("/tmp/fixtures_build/fixtures")

# expected class per file (by filename marker)
def expected_class(path):
    n = path.name
    if "NEG_f2o-012" in n:        # invalid FHIR by construction
        return "invalid_fhir"
    if "_NEG_" in n:              # valid FHIR, transform must filter/handle
        return "valid_should_fail"
    return "conformant"

R4B = "fhir.resources.R4B."
def model_for(rtype):
    mod = importlib.import_module(R4B + rtype.lower())
    return getattr(mod, rtype)

results=[]
for path in sorted(ROOT.rglob("*.json")):
    data = json.loads(path.read_text())
    rtype = data["resourceType"]
    exp = expected_class(path)
    try:
        m = model_for(rtype)
        (m.model_validate if hasattr(m,"model_validate") else m.parse_obj)(data)
        validated = True; err=""
    except Exception as e:
        validated = False; err=str(e).splitlines()[0][:90]
    # decide pass/fail of the GATE (did it land where intended?)
    if exp in ("conformant","valid_should_fail"):
        gate_ok = validated
    else:  # invalid_fhir
        gate_ok = (not validated)
    results.append((str(path.relative_to(ROOT)), rtype, exp, validated, gate_ok, err))

# report
w=max(len(r[0]) for r in results)
print(f"{'FILE':<{w}}  {'EXPECTED':<17} {'VALIDATES':<9} GATE")
print("-"*(w+40))
passes=fails=0
for rel,rt,exp,val,ok,err in results:
    flag = "ok" if ok else "XX FAIL"
    if ok: passes+=1
    else: fails+=1
    print(f"{rel:<{w}}  {exp:<17} {str(val):<9} {flag}")
    if not ok and err:
        print(f"{'':<{w}}    -> {err}")
print("-"*(w+40))
print(f"{passes} gate-pass, {fails} gate-fail, {len(results)} total")
sys.exit(1 if fails else 0)
