# Specialty Domain Packs

Specialty Domain Packs provide a metadata and documentation layer grouping FHIR-to-OMOP clinical mapping branches, cases, and rules by product or clinical specialty (e.g. oncology, cardiology) without altering the flat case structure under the `cases/` folder.

---

## Directory Structure

```
packs/
├── schema/
│   └── pack.schema.json               # JSON Schema for pack definitions
└── specialty/
    └── oncology-ngs-biomarker/        # Specialty pack identifier folder
        ├── pack.json                  # Pack metadata (references cases)
        ├── README.md                  # Clinical scope and flow diagram
        ├── GAPS.md                    # Tracked domain-specific mapping gaps
        └── _vocab_seed.sql            # (Optional) Pack-specific vocabulary inserts
```

---

## How It Works

1. **Pack Definition (`pack.json`):**
   A JSON file validated against `packs/schema/pack.schema.json` that maps the specialty name to a list of case files located in the `cases/` directory.
2. **Dynamic Vocabulary Load:**
   The test runner ([`script/run-cases.ts`](script/run-cases.ts)) dynamically scans `packs/specialty/` at startup. If a specialty contains a `_vocab_seed.sql` file, its inserts are executed against the database's `vocab` schema, allowing pack-specific clinical concepts to map successfully without bloating the global seed file [`cases/_vocab_seed.sql`](cases/_vocab_seed.sql).
3. **Targeted Runs:**
   You can execute tests only for a specific pack using the `--pack` flag:
   ```bash
   bun script/run-cases.ts --pack oncology-ngs-biomarker
   ```

---

## How to Add a New Pack

Follow these steps to add a new specialty domain pack:

### Step 1: Create the Directory
Create a new kebab-cased directory inside `packs/specialty/`:
```bash
mkdir -p packs/specialty/my-new-specialty
```

### Step 2: Define `pack.json`
Create a `pack.json` file inside the new folder. The `name` property **must** match the directory name:
```json
{
  "$schema": "../../schema/pack.schema.json",
  "name": "my-new-specialty",
  "title": "My New Specialty Clinical Pack",
  "description": "Standardized mappings and test cases for My New Specialty.",
  "cases": [
    "condition--condition-occurrence--my-specialty-case.json"
  ]
}
```

### Step 3: Create Cases
Add your referenced test case files in the core [`cases/`](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/cases/) directory (e.g. `cases/condition--condition-occurrence--my-specialty-case.json`). Ensure they conform to the case structure.

### Step 4: Add Pack Seed (Optional)
If your cases require concepts not present in the baseline [`cases/_vocab_seed.sql`](file:///Users/dmitryshirokov/Downloads/FHIR2OMOP/fhir2omop/cases/_vocab_seed.sql), create a local `_vocab_seed.sql` file containing the necessary concept/relationship inserts:
```sql
-- My New Specialty Pack vocabulary seed additions
INSERT INTO vocab.concept VALUES ('CONCEPT_ID', 'Concept Name', 'Domain', 'Vocabulary', 'Class', 'S', 'CODE', 'DATE', 'DATE', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('CONCEPT_ID_1', 'CONCEPT_ID_2', 'Maps to', 'DATE', 'DATE', NULL) ON CONFLICT DO NOTHING;
```

### Step 5: Document the Pack
Write a `README.md` outlining the mapping flow and target models, and a `GAPS.md` to track unresolved terminology or structural gaps.

### Step 6: Validate the Pack
1. Run the packs linter to verify schema correctness and referential integrity:
   ```bash
   bun script/lint-packs.ts
   ```
2. Run your pack-specific test suite:
   ```bash
   bun script/run-cases.ts --pack my-new-specialty
   ```
