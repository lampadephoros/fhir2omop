-- Oncology NGS Biomarker Specialty Pack vocabulary seed additions
INSERT INTO vocab.concept VALUES ('4115276', 'Adenocarcinoma of lung', 'Condition', 'SNOMED', 'Disorder', 'S', '254632001', '2002-01-31', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('436659', 'Secondary malignant neoplasm of brain', 'Condition', 'SNOMED', 'Disorder', 'S', '94225005', '2002-01-31', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('44818854', 'Primary of', 'Metadata', 'Relationship', 'Relationship', 'S', 'Primary of', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept VALUES ('44818765', 'Metastasis of', 'Metadata', 'Relationship', 'Relationship', 'S', 'Metastasis of', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('4115276', '4115276', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
INSERT INTO vocab.concept_relationship VALUES ('436659', '436659', 'Maps to', '1970-01-01', '2099-12-31', NULL) ON CONFLICT DO NOTHING;
