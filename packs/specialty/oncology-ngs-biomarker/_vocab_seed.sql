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

INSERT INTO vocab.concept_relationship VALUES ('4115276', '4115276', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('436659', '436659', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4038164', '4038164', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4031641', '4031641', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4264660', '4264660', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4264661', '4264661', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;

