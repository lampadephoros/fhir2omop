-- Oncology NGS Biomarker Specialty Pack vocabulary seed additions
INSERT INTO vocab.concept VALUES ('4115276', 'Adenocarcinoma of lung', 'Condition', 'SNOMED', 'Disorder', 'S', '254632001', '2002-01-31', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('436659', 'Secondary malignant neoplasm of brain', 'Condition', 'SNOMED', 'Disorder', 'S', '94225005', '2002-01-31', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('44818854', 'Primary of', 'Metadata', 'Relationship', 'Relationship', 'S', 'Primary of', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('44818765', 'Metastasis of', 'Metadata', 'Relationship', 'Relationship', 'S', 'Metastasis of', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4038164', 'Tissue specimen', 'Specimen', 'SNOMED', 'Specimen', 'S', '258435002', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4034965', 'Formalin fixed paraffin embedded sectioning', 'Procedure', 'SNOMED', 'Procedure', 'S', '434643000', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4031641', 'Structure of left upper lobe of lung', 'Spec Anatomic Site', 'SNOMED', 'Body Structure', 'S', '361362002', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4264660', 'Formalin-fixed paraffin-embedded tissue specimen', 'Specimen', 'SNOMED', 'Specimen', 'S', '441652008', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4264661', 'Frozen tissue specimen', 'Specimen', 'SNOMED', 'Specimen', 'S', '429215003', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

-- Staging & Genomics Panels (LOINC)
INSERT INTO vocab.concept VALUES ('3011961', 'Gene variant analysis of DNA by mutational analysis', 'Observation', 'LOINC', 'Clinical Observation', 'S', '48018-6', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3027815', 'Tumor mutational burden', 'Measurement', 'LOINC', 'Clinical Observation', 'S', '94076-7', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3016431', 'Microsatellite instability [Presence] in Tumor by MS PCR', 'Measurement', 'LOINC', 'Clinical Observation', 'S', '81695-9', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3009088', 'Stage group.pathological Cancer', 'Observation', 'LOINC', 'Clinical Observation', 'S', '21908-9', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3016327', 'Stage group.clinical Cancer', 'Observation', 'LOINC', 'Clinical Observation', 'S', '21902-2', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3004248', 'Primary tumor.pathological Cancer', 'Observation', 'LOINC', 'Clinical Observation', 'S', '21905-5', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3027376', 'Regional lymph nodes.pathological Cancer', 'Observation', 'LOINC', 'Clinical Observation', 'S', '21906-3', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('3011967', 'Distant metastasis.pathological Cancer', 'Observation', 'LOINC', 'Clinical Observation', 'S', '21907-1', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

-- Value concepts (MSI & Staging results)
INSERT INTO vocab.concept VALUES ('45878583', 'High', 'Meas Value', 'LOINC', 'Answer', 'S', 'LA26284-4', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('45880456', 'Stable', 'Meas Value', 'LOINC', 'Answer', 'S', 'LA26282-8', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4163872', 'Stage IIIA', 'Meas Value', 'SNOMED', 'Qualifier Value', 'S', '371607005', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4163863', 'Pathological T3', 'Meas Value', 'SNOMED', 'Qualifier Value', 'S', '371497001', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4163867', 'Pathological N1', 'Meas Value', 'SNOMED', 'Qualifier Value', 'S', '371501004', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('4163870', 'Pathological M0', 'Meas Value', 'SNOMED', 'Qualifier Value', 'S', '371504007', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

-- Relationship concepts
INSERT INTO vocab.concept VALUES ('44818790', 'Has panel member', 'Metadata', 'Relationship', 'Relationship', 'S', 'Has panel member', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('44818873', 'Panel member of', 'Metadata', 'Relationship', 'Relationship', 'S', 'Panel member of', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

-- Maps-to relationships
INSERT INTO vocab.concept_relationship VALUES ('4115276', '4115276', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('436659', '436659', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4038164', '4038164', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4031641', '4031641', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4264660', '4264660', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4264661', '4264661', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

INSERT INTO vocab.concept_relationship VALUES ('3011961', '3011961', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3027815', '3027815', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3016431', '3016431', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3009088', '3009088', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3016327', '3016327', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3004248', '3004248', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3027376', '3027376', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('3011967', '3011967', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

INSERT INTO vocab.concept_relationship VALUES ('45878583', '45878583', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('45880456', '45880456', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4163872', '4163872', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4163863', '4163863', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4163867', '4163867', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4163870', '4163870', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

-- Targeted Therapies & Immunotherapy (RxNorm)
INSERT INTO vocab.concept VALUES ('35200373', 'Osimertinib 80 MG Oral Tablet', 'Drug', 'RxNorm', 'Clinical Drug', 'S', '1716277', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('35200140', 'Pembrolizumab 25 MG/ML Injectable Solution', 'Drug', 'RxNorm', 'Clinical Drug', 'S', '1547548', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

-- Maps-to relationships for Drugs
INSERT INTO vocab.concept_relationship VALUES ('35200373', '35200373', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('35200140', '35200140', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;



