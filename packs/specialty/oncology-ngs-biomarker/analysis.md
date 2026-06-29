# Cohort Analysis Capabilities

Based on the mappings implemented in this specialty pack, you unlock several highly valuable real-world data (RWD) cohort analyses by linking standardized genomic data, clinical diagnoses, and treatment records within the OMOP CDM structure:

### 1. Biomarker-Driven Treatment Utilization
Build cohorts to see if clinical guidelines are being followed based on NGS test results.
* **Analysis:** Identify the percentage of patients with a specific actionable mutation (e.g., **EGFR L858R**) who subsequently received the recommended targeted therapy (e.g., **Osimertinib**).
* **How it works:** Join the `observation` table (filtering for LOINC `48018-6` and your specific HGVS strings) with the `drug_exposure` table (filtering for the specific RxNorm concept).

### 2. Time-to-Treatment Initiation
Measure the operational efficiency and clinical delay between diagnosis/testing and therapy.
* **Analysis:** Calculate the average number of days between the receipt of a positive NGS biomarker result (e.g., PD-L1 high) and the start date of immunotherapy (e.g., Pembrolizumab).
* **How it works:** Calculate the time delta between `observation_date` (for the biomarker) and `drug_exposure_start_date` (for the medication).

### 3. Progression-Free Survival (PFS) & Treatment Failure Proxies
Because we've implemented primary-to-metastatic linkage, you can estimate disease progression timelines.
* **Analysis:** Measure the time from the initiation of a first-line targeted therapy until the appearance of a new metastatic lesion (disease progression).
* **How it works:** Look for the earliest `drug_exposure` record for your targeted drug, and then find the first subsequent `condition_occurrence` that is linked as a metastasis (via the `fact_relationship` table) to the primary tumor.

### 4. Cohort Comparisons: Immunotherapy vs. Targeted Therapy
Isolate sub-populations based on their complex biomarker profiles and compare their treatment pathways.
* **Analysis:** Compare patients who have high Tumor Mutational Burden (TMB) against those with an EGFR mutation to map out their respective first-line and second-line therapies.
* **How it works:** Create two distinct cohorts using the `observation` table (TMB > 10 mut/Mb vs. EGFR positive), then analyze the sequence of their `drug_exposure` records.

### 5. Advanced / Metastatic Subgroup Identification
Filter your analyses to focus only on late-stage patients.
* **Analysis:** Identify patients who were diagnosed with metastatic disease *before* any targeted therapy was initiated (De novo metastatic) versus those who developed metastases *after* initial treatment.
* **How it works:** Compare the `condition_start_date` of conditions linked via `fact_relationship` (Metastasis of) against the earliest `drug_exposure_start_date` for oncology medications.

---

## Real-World Evidence (RWE) Applications

When you use the RWD cohorts described above to draw clinical conclusions, you generate **Real-World Evidence (RWE)**. This standardized OMOP foundation enables several advanced RWE use cases that are highly sought after by pharmaceutical companies and regulatory bodies:

### 1. Synthetic Control Arms (External Control Cohorts)
For rare mutations (like specific ALK fusions or rare EGFR exon insertions), recruiting enough patients for a randomized clinical trial is very difficult.
* **RWE Application:** Use your OMOP database to generate a historical "synthetic" control arm of patients who have the rare mutation and received standard-of-care, then compare their survival/PFS against patients receiving an experimental drug in a single-arm trial.

### 2. Comparative Effectiveness Research (CER)
Clinical trials show how a drug works in a highly controlled, ideal environment. RWE shows how it works in the "real world" with a diverse patient population.
* **RWE Application:** Compare the real-world outcomes of patients taking **Osimertinib** versus an older TKI (like Erlotinib) or Immunotherapy in patients with specific biomarker profiles, adjusting for real-world variables like comorbidities (pulled from other OMOP `condition_occurrence` records).

### 3. Post-Market Safety & Pharmacovigilance
Regulators require monitoring of a drug's safety after it hits the market.
* **RWE Application:** By looking at the `condition_occurrence` table *after* a `drug_exposure_start_date`, you can track real-world adverse events (e.g., immune-related adverse events from Pembrolizumab like pneumonitis or colitis) and calculate their real-world incidence rates based on specific genomic profiles.

### 4. Label Expansion Support
If a targeted therapy is approved for lung cancer, but data shows doctors are prescribing it off-label for breast cancer patients who share the same genetic mutation.
* **RWE Application:** Query the database to find these off-label cohorts and analyze their response rates. This RWE is frequently submitted to regulatory bodies to support expanding the official approval label to new cancer types based on shared biomarkers (tumor-agnostic approvals).
