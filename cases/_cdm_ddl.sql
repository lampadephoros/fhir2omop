--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9 (Debian 17.9-1.pgdg13+1)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: cdm_ours_fhir; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA cdm_ours_fhir;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: care_site; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.care_site (
    care_site_id bigint NOT NULL,
    care_site_name character varying(255),
    place_of_service_concept_id integer,
    location_id bigint,
    care_site_source_value character varying(50),
    place_of_service_source_value character varying(50)
);


--
-- Name: cdm_source; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.cdm_source (
    cdm_source_name character varying(255) NOT NULL,
    cdm_source_abbreviation character varying(25) NOT NULL,
    cdm_holder character varying(255) NOT NULL,
    source_description text,
    source_documentation_reference character varying(255),
    cdm_etl_reference character varying(255),
    source_release_date date NOT NULL,
    cdm_release_date date NOT NULL,
    cdm_version character varying(10),
    cdm_version_concept_id integer NOT NULL,
    vocabulary_version character varying(20) NOT NULL
);


--
-- Name: cohort; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.cohort (
    cohort_definition_id bigint NOT NULL,
    subject_id bigint NOT NULL,
    cohort_start_date date NOT NULL,
    cohort_end_date date NOT NULL
);


--
-- Name: cohort_definition; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.cohort_definition (
    cohort_definition_id bigint NOT NULL,
    cohort_definition_name character varying(255) NOT NULL,
    cohort_definition_description text,
    definition_type_concept_id integer NOT NULL,
    cohort_definition_syntax text,
    subject_concept_id integer NOT NULL,
    cohort_initiation_date date
);


--
-- Name: concept; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.concept (
    concept_id integer NOT NULL,
    concept_name character varying(255) NOT NULL,
    domain_id character varying(20) NOT NULL,
    vocabulary_id character varying(20) NOT NULL,
    concept_class_id character varying(20) NOT NULL,
    standard_concept character varying(1),
    concept_code character varying(50) NOT NULL,
    valid_start_date date NOT NULL,
    valid_end_date date NOT NULL,
    invalid_reason character varying(1)
);


--
-- Name: concept_ancestor; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.concept_ancestor (
    ancestor_concept_id integer NOT NULL,
    descendant_concept_id integer NOT NULL,
    min_levels_of_separation integer NOT NULL,
    max_levels_of_separation integer NOT NULL
);


--
-- Name: concept_class; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.concept_class (
    concept_class_id character varying(20) NOT NULL,
    concept_class_name character varying(255) NOT NULL,
    concept_class_concept_id integer NOT NULL
);


--
-- Name: concept_relationship; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.concept_relationship (
    concept_id_1 integer NOT NULL,
    concept_id_2 integer NOT NULL,
    relationship_id character varying(20) NOT NULL,
    valid_start_date date NOT NULL,
    valid_end_date date NOT NULL,
    invalid_reason character varying(1)
);


--
-- Name: concept_synonym; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.concept_synonym (
    concept_id integer NOT NULL,
    concept_synonym_name character varying(1000) NOT NULL,
    language_concept_id integer NOT NULL
);


--
-- Name: condition_era; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.condition_era (
    condition_era_id bigint NOT NULL,
    person_id bigint NOT NULL,
    condition_concept_id integer NOT NULL,
    condition_era_start_date date NOT NULL,
    condition_era_end_date date NOT NULL,
    condition_occurrence_count integer
);


--
-- Name: condition_occurrence; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.condition_occurrence (
    condition_occurrence_id bigint NOT NULL,
    person_id bigint NOT NULL,
    condition_concept_id integer NOT NULL,
    condition_start_date date NOT NULL,
    condition_start_datetime timestamp without time zone,
    condition_end_date date,
    condition_end_datetime timestamp without time zone,
    condition_type_concept_id integer NOT NULL,
    condition_status_concept_id integer,
    stop_reason character varying(20),
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    condition_source_value character varying(50),
    condition_source_concept_id integer,
    condition_status_source_value character varying(50)
);


--
-- Name: cost; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.cost (
    cost_id bigint NOT NULL,
    cost_event_id bigint NOT NULL,
    cost_domain_id character varying(20) NOT NULL,
    cost_type_concept_id integer NOT NULL,
    currency_concept_id integer,
    total_charge numeric,
    total_cost numeric,
    total_paid numeric,
    paid_by_payer numeric,
    paid_by_patient numeric,
    paid_patient_copay numeric,
    paid_patient_coinsurance numeric,
    paid_patient_deductible numeric,
    paid_by_primary numeric,
    paid_ingredient_cost numeric,
    paid_dispensing_fee numeric,
    payer_plan_period_id bigint,
    amount_allowed numeric,
    revenue_code_concept_id integer,
    revenue_code_source_value character varying(50),
    drg_concept_id integer,
    drg_source_value character varying(3)
);


--
-- Name: death; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.death (
    person_id bigint NOT NULL,
    death_date date NOT NULL,
    death_datetime timestamp without time zone,
    death_type_concept_id integer,
    cause_concept_id integer,
    cause_source_value character varying(50),
    cause_source_concept_id integer
);


--
-- Name: device_exposure; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.device_exposure (
    device_exposure_id bigint NOT NULL,
    person_id bigint NOT NULL,
    device_concept_id integer NOT NULL,
    device_exposure_start_date date NOT NULL,
    device_exposure_start_datetime timestamp without time zone,
    device_exposure_end_date date,
    device_exposure_end_datetime timestamp without time zone,
    device_type_concept_id integer NOT NULL,
    unique_device_id character varying(255),
    production_id character varying(255),
    quantity integer,
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    device_source_value character varying(50),
    device_source_concept_id integer,
    unit_concept_id integer,
    unit_source_value character varying(50),
    unit_source_concept_id integer
);


--
-- Name: domain; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.domain (
    domain_id character varying(20) NOT NULL,
    domain_name character varying(255) NOT NULL,
    domain_concept_id integer NOT NULL
);


--
-- Name: dose_era; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.dose_era (
    dose_era_id bigint NOT NULL,
    person_id bigint NOT NULL,
    drug_concept_id integer NOT NULL,
    unit_concept_id integer NOT NULL,
    dose_value numeric NOT NULL,
    dose_era_start_date date NOT NULL,
    dose_era_end_date date NOT NULL
);


--
-- Name: drug_era; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.drug_era (
    drug_era_id bigint NOT NULL,
    person_id bigint NOT NULL,
    drug_concept_id integer NOT NULL,
    drug_era_start_date date NOT NULL,
    drug_era_end_date date NOT NULL,
    drug_exposure_count integer,
    gap_days integer
);


--
-- Name: drug_exposure; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.drug_exposure (
    drug_exposure_id bigint NOT NULL,
    person_id bigint NOT NULL,
    drug_concept_id integer NOT NULL,
    drug_exposure_start_date date NOT NULL,
    drug_exposure_start_datetime timestamp without time zone,
    drug_exposure_end_date date NOT NULL,
    drug_exposure_end_datetime timestamp without time zone,
    verbatim_end_date date,
    drug_type_concept_id integer NOT NULL,
    stop_reason character varying(20),
    refills integer,
    quantity numeric,
    days_supply integer,
    sig text,
    route_concept_id integer,
    lot_number character varying(50),
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    drug_source_value character varying(50),
    drug_source_concept_id integer,
    route_source_value character varying(50),
    dose_unit_source_value character varying(50)
);


--
-- Name: drug_strength; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.drug_strength (
    drug_concept_id integer NOT NULL,
    ingredient_concept_id integer NOT NULL,
    amount_value numeric,
    amount_unit_concept_id integer,
    numerator_value numeric,
    numerator_unit_concept_id integer,
    denominator_value numeric,
    denominator_unit_concept_id integer,
    box_size integer,
    valid_start_date date NOT NULL,
    valid_end_date date NOT NULL,
    invalid_reason character varying(1)
);


--
-- Name: episode; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.episode (
    episode_id bigint NOT NULL,
    person_id bigint NOT NULL,
    episode_concept_id integer NOT NULL,
    episode_start_date date NOT NULL,
    episode_start_datetime timestamp without time zone,
    episode_end_date date,
    episode_end_datetime timestamp without time zone,
    episode_parent_id bigint,
    episode_number integer,
    episode_object_concept_id integer NOT NULL,
    episode_type_concept_id integer NOT NULL,
    episode_source_value character varying(50),
    episode_source_concept_id integer
);


--
-- Name: episode_event; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.episode_event (
    episode_id bigint NOT NULL,
    event_id bigint NOT NULL,
    episode_event_field_concept_id integer NOT NULL
);


--
-- Name: fact_relationship; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.fact_relationship (
    domain_concept_id_1 integer NOT NULL,
    fact_id_1 bigint NOT NULL,
    domain_concept_id_2 integer NOT NULL,
    fact_id_2 bigint NOT NULL,
    relationship_concept_id integer NOT NULL
);


--
-- Name: location; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.location (
    location_id bigint NOT NULL,
    address_1 character varying(50),
    address_2 character varying(50),
    city character varying(50),
    state character varying(2),
    zip character varying(9),
    county character varying(20),
    location_source_value character varying(50),
    country_concept_id integer,
    country_source_value character varying(80),
    latitude numeric,
    longitude numeric
);


--
-- Name: measurement; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.measurement (
    measurement_id bigint NOT NULL,
    person_id bigint NOT NULL,
    measurement_concept_id integer NOT NULL,
    measurement_date date NOT NULL,
    measurement_datetime timestamp without time zone,
    measurement_time character varying(10),
    measurement_type_concept_id integer NOT NULL,
    operator_concept_id integer,
    value_as_number numeric,
    value_as_concept_id integer,
    unit_concept_id integer,
    range_low numeric,
    range_high numeric,
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    measurement_source_value character varying(50),
    measurement_source_concept_id integer,
    unit_source_value character varying(50),
    unit_source_concept_id integer,
    value_source_value character varying(50),
    measurement_event_id bigint,
    meas_event_field_concept_id integer
);


--
-- Name: metadata; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.metadata (
    metadata_id bigint NOT NULL,
    metadata_concept_id integer NOT NULL,
    metadata_type_concept_id integer NOT NULL,
    name character varying(250) NOT NULL,
    value_as_string character varying(250),
    value_as_concept_id integer,
    value_as_number numeric,
    metadata_date date,
    metadata_datetime timestamp without time zone
);


--
-- Name: note; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.note (
    note_id bigint NOT NULL,
    person_id bigint NOT NULL,
    note_date date NOT NULL,
    note_datetime timestamp without time zone,
    note_type_concept_id integer NOT NULL,
    note_class_concept_id integer NOT NULL,
    note_title character varying(250),
    note_text text NOT NULL,
    encoding_concept_id integer NOT NULL,
    language_concept_id integer NOT NULL,
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    note_source_value character varying(50),
    note_event_id bigint,
    note_event_field_concept_id integer
);


--
-- Name: note_nlp; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.note_nlp (
    note_nlp_id bigint NOT NULL,
    note_id bigint NOT NULL,
    section_concept_id integer,
    snippet character varying(250),
    "offset" character varying(50),
    lexical_variant character varying(250) NOT NULL,
    note_nlp_concept_id integer,
    note_nlp_source_concept_id integer,
    nlp_system character varying(250),
    nlp_date date NOT NULL,
    nlp_datetime timestamp without time zone,
    term_exists character varying(1),
    term_temporal character varying(50),
    term_modifiers character varying(2000)
);


--
-- Name: observation; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.observation (
    observation_id bigint NOT NULL,
    person_id bigint NOT NULL,
    observation_concept_id integer NOT NULL,
    observation_date date NOT NULL,
    observation_datetime timestamp without time zone,
    observation_type_concept_id integer NOT NULL,
    value_as_number numeric,
    value_as_string character varying(60),
    value_as_concept_id integer,
    qualifier_concept_id integer,
    unit_concept_id integer,
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    observation_source_value character varying(50),
    observation_source_concept_id integer,
    unit_source_value character varying(50),
    qualifier_source_value character varying(50),
    value_source_value character varying(50),
    observation_event_id bigint,
    obs_event_field_concept_id integer
);


--
-- Name: observation_period; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.observation_period (
    observation_period_id bigint NOT NULL,
    person_id bigint NOT NULL,
    observation_period_start_date date NOT NULL,
    observation_period_end_date date NOT NULL,
    period_type_concept_id integer NOT NULL
);


--
-- Name: payer_plan_period; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.payer_plan_period (
    payer_plan_period_id bigint NOT NULL,
    person_id bigint NOT NULL,
    payer_plan_period_start_date date NOT NULL,
    payer_plan_period_end_date date NOT NULL,
    payer_concept_id integer,
    payer_source_value character varying(50),
    payer_source_concept_id integer,
    plan_concept_id integer,
    plan_source_value character varying(50),
    plan_source_concept_id integer,
    sponsor_concept_id integer,
    sponsor_source_value character varying(50),
    sponsor_source_concept_id integer,
    family_source_value character varying(50),
    stop_reason_concept_id integer,
    stop_reason_source_value character varying(50),
    stop_reason_source_concept_id integer
);


--
-- Name: person; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.person (
    person_id bigint NOT NULL,
    gender_concept_id integer NOT NULL,
    year_of_birth integer NOT NULL,
    month_of_birth integer,
    day_of_birth integer,
    birth_datetime timestamp without time zone,
    race_concept_id integer NOT NULL,
    ethnicity_concept_id integer NOT NULL,
    location_id bigint,
    provider_id bigint,
    care_site_id bigint,
    person_source_value character varying(50),
    gender_source_value character varying(50),
    gender_source_concept_id integer,
    race_source_value character varying(50),
    race_source_concept_id integer,
    ethnicity_source_value character varying(50),
    ethnicity_source_concept_id integer
);


--
-- Name: procedure_occurrence; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.procedure_occurrence (
    procedure_occurrence_id bigint NOT NULL,
    person_id bigint NOT NULL,
    procedure_concept_id integer NOT NULL,
    procedure_date date NOT NULL,
    procedure_datetime timestamp without time zone,
    procedure_end_date date,
    procedure_end_datetime timestamp without time zone,
    procedure_type_concept_id integer NOT NULL,
    modifier_concept_id integer,
    quantity integer,
    provider_id bigint,
    visit_occurrence_id bigint,
    visit_detail_id bigint,
    procedure_source_value character varying(50),
    procedure_source_concept_id integer,
    modifier_source_value character varying(50)
);


--
-- Name: provider; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.provider (
    provider_id bigint NOT NULL,
    provider_name character varying(255),
    npi character varying(20),
    dea character varying(20),
    specialty_concept_id integer,
    care_site_id bigint,
    year_of_birth integer,
    gender_concept_id integer,
    provider_source_value character varying(50),
    specialty_source_value character varying(50),
    specialty_source_concept_id integer,
    gender_source_value character varying(50),
    gender_source_concept_id integer
);


--
-- Name: relationship; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.relationship (
    relationship_id character varying(20) NOT NULL,
    relationship_name character varying(255) NOT NULL,
    is_hierarchical character varying(1) NOT NULL,
    defines_ancestry character varying(1) NOT NULL,
    reverse_relationship_id character varying(20) NOT NULL,
    relationship_concept_id integer NOT NULL
);


--
-- Name: source_to_concept_map; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.source_to_concept_map (
    source_code character varying(50) NOT NULL,
    source_concept_id integer NOT NULL,
    source_vocabulary_id character varying(20) NOT NULL,
    source_code_description character varying(255),
    target_concept_id integer NOT NULL,
    target_vocabulary_id character varying(20) NOT NULL,
    valid_start_date date NOT NULL,
    valid_end_date date NOT NULL,
    invalid_reason character varying(1)
);


--
-- Name: specimen; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.specimen (
    specimen_id bigint NOT NULL,
    person_id bigint NOT NULL,
    specimen_concept_id integer NOT NULL,
    specimen_type_concept_id integer NOT NULL,
    specimen_date date NOT NULL,
    specimen_datetime timestamp without time zone,
    quantity numeric,
    unit_concept_id integer,
    anatomic_site_concept_id integer,
    disease_status_concept_id integer,
    specimen_source_id character varying(50),
    specimen_source_value character varying(50),
    unit_source_value character varying(50),
    anatomic_site_source_value character varying(50),
    disease_status_source_value character varying(50)
);


--
-- Name: visit_detail; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.visit_detail (
    visit_detail_id bigint NOT NULL,
    person_id bigint NOT NULL,
    visit_detail_concept_id integer NOT NULL,
    visit_detail_start_date date NOT NULL,
    visit_detail_start_datetime timestamp without time zone,
    visit_detail_end_date date NOT NULL,
    visit_detail_end_datetime timestamp without time zone,
    visit_detail_type_concept_id integer NOT NULL,
    provider_id bigint,
    care_site_id bigint,
    visit_detail_source_value character varying(50),
    visit_detail_source_concept_id integer,
    admitted_from_concept_id integer,
    admitted_from_source_value character varying(50),
    discharged_to_source_value character varying(50),
    discharged_to_concept_id integer,
    preceding_visit_detail_id bigint,
    parent_visit_detail_id bigint,
    visit_occurrence_id bigint NOT NULL
);


--
-- Name: visit_occurrence; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.visit_occurrence (
    visit_occurrence_id bigint NOT NULL,
    person_id bigint NOT NULL,
    visit_concept_id integer NOT NULL,
    visit_start_date date NOT NULL,
    visit_start_datetime timestamp without time zone,
    visit_end_date date NOT NULL,
    visit_end_datetime timestamp without time zone,
    visit_type_concept_id integer NOT NULL,
    provider_id bigint,
    care_site_id bigint,
    visit_source_value character varying(50),
    visit_source_concept_id integer,
    admitted_from_concept_id integer,
    admitted_from_source_value character varying(50),
    discharged_to_concept_id integer,
    discharged_to_source_value character varying(50),
    preceding_visit_occurrence_id bigint
);


--
-- Name: vocabulary; Type: TABLE; Schema: cdm_ours_fhir; Owner: -
--

CREATE TABLE cdm_ours_fhir.vocabulary (
    vocabulary_id character varying(20) NOT NULL,
    vocabulary_name character varying(255) NOT NULL,
    vocabulary_reference character varying(255),
    vocabulary_version character varying(255),
    vocabulary_concept_id integer NOT NULL
);


--
-- Name: care_site care_site_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.care_site
    ADD CONSTRAINT care_site_pkey PRIMARY KEY (care_site_id);


--
-- Name: condition_occurrence condition_occurrence_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.condition_occurrence
    ADD CONSTRAINT condition_occurrence_pkey PRIMARY KEY (condition_occurrence_id);


--
-- Name: death death_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.death
    ADD CONSTRAINT death_pkey PRIMARY KEY (person_id);


--
-- Name: device_exposure device_exposure_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.device_exposure
    ADD CONSTRAINT device_exposure_pkey PRIMARY KEY (device_exposure_id);


--
-- Name: drug_exposure drug_exposure_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.drug_exposure
    ADD CONSTRAINT drug_exposure_pkey PRIMARY KEY (drug_exposure_id);


--
-- Name: location location_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.location
    ADD CONSTRAINT location_pkey PRIMARY KEY (location_id);


--
-- Name: measurement measurement_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.measurement
    ADD CONSTRAINT measurement_pkey PRIMARY KEY (measurement_id);


--
-- Name: note note_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.note
    ADD CONSTRAINT note_pkey PRIMARY KEY (note_id);


--
-- Name: observation_period observation_period_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.observation_period
    ADD CONSTRAINT observation_period_pkey PRIMARY KEY (observation_period_id);


--
-- Name: observation observation_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.observation
    ADD CONSTRAINT observation_pkey PRIMARY KEY (observation_id);


--
-- Name: person person_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.person
    ADD CONSTRAINT person_pkey PRIMARY KEY (person_id);


--
-- Name: procedure_occurrence procedure_occurrence_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.procedure_occurrence
    ADD CONSTRAINT procedure_occurrence_pkey PRIMARY KEY (procedure_occurrence_id);


--
-- Name: provider provider_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.provider
    ADD CONSTRAINT provider_pkey PRIMARY KEY (provider_id);


--
-- Name: visit_occurrence visit_occurrence_pkey; Type: CONSTRAINT; Schema: cdm_ours_fhir; Owner: -
--

ALTER TABLE ONLY cdm_ours_fhir.visit_occurrence
    ADD CONSTRAINT visit_occurrence_pkey PRIMARY KEY (visit_occurrence_id);


--
-- Name: ix_cdm_ours_fhir_care_site_care_sit; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_care_site_care_sit ON cdm_ours_fhir.care_site USING btree (care_site_source_value);


--
-- Name: ix_cdm_ours_fhir_condition_occurrence_conditio; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_condition_occurrence_conditio ON cdm_ours_fhir.condition_occurrence USING btree (condition_source_value);


--
-- Name: ix_cdm_ours_fhir_condition_occurrence_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_condition_occurrence_person_i ON cdm_ours_fhir.condition_occurrence USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_condition_occurrence_person_i_conditio_conditi; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_condition_occurrence_person_i_conditio_conditi ON cdm_ours_fhir.condition_occurrence USING btree (person_id, condition_source_value, condition_start_date);


--
-- Name: ix_cdm_ours_fhir_death_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_death_person_i ON cdm_ours_fhir.death USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_device_exposure_device_s; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_device_exposure_device_s ON cdm_ours_fhir.device_exposure USING btree (device_source_value);


--
-- Name: ix_cdm_ours_fhir_device_exposure_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_device_exposure_person_i ON cdm_ours_fhir.device_exposure USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_drug_exposure_drug_sou; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_drug_exposure_drug_sou ON cdm_ours_fhir.drug_exposure USING btree (drug_source_value);


--
-- Name: ix_cdm_ours_fhir_drug_exposure_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_drug_exposure_person_i ON cdm_ours_fhir.drug_exposure USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_drug_exposure_person_i_drug_sou_drug_exp; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_drug_exposure_person_i_drug_sou_drug_exp ON cdm_ours_fhir.drug_exposure USING btree (person_id, drug_source_value, drug_exposure_start_date);


--
-- Name: ix_cdm_ours_fhir_location_location; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_location_location ON cdm_ours_fhir.location USING btree (location_source_value);


--
-- Name: ix_cdm_ours_fhir_measurement_measurem; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_measurement_measurem ON cdm_ours_fhir.measurement USING btree (measurement_source_value);


--
-- Name: ix_cdm_ours_fhir_measurement_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_measurement_person_i ON cdm_ours_fhir.measurement USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_measurement_person_i_measurem_measurem; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_measurement_person_i_measurem_measurem ON cdm_ours_fhir.measurement USING btree (person_id, measurement_source_value, measurement_date);


--
-- Name: ix_cdm_ours_fhir_observation_observat; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_observation_observat ON cdm_ours_fhir.observation USING btree (observation_source_value);


--
-- Name: ix_cdm_ours_fhir_observation_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_observation_person_i ON cdm_ours_fhir.observation USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_observation_person_i_observat_observat; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_observation_person_i_observat_observat ON cdm_ours_fhir.observation USING btree (person_id, observation_source_value, observation_date);


--
-- Name: ix_cdm_ours_fhir_person_person_s; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_person_person_s ON cdm_ours_fhir.person USING btree (person_source_value);


--
-- Name: ix_cdm_ours_fhir_procedure_occurrence_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_procedure_occurrence_person_i ON cdm_ours_fhir.procedure_occurrence USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_procedure_occurrence_person_i_procedur_procedu; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_procedure_occurrence_person_i_procedur_procedu ON cdm_ours_fhir.procedure_occurrence USING btree (person_id, procedure_source_value, procedure_date);


--
-- Name: ix_cdm_ours_fhir_procedure_occurrence_procedur; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_procedure_occurrence_procedur ON cdm_ours_fhir.procedure_occurrence USING btree (procedure_source_value);


--
-- Name: ix_cdm_ours_fhir_provider_npi; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_provider_npi ON cdm_ours_fhir.provider USING btree (npi);


--
-- Name: ix_cdm_ours_fhir_provider_provider; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_provider_provider ON cdm_ours_fhir.provider USING btree (provider_source_value);


--
-- Name: ix_cdm_ours_fhir_visit_occurrence_person_i; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_visit_occurrence_person_i ON cdm_ours_fhir.visit_occurrence USING btree (person_id);


--
-- Name: ix_cdm_ours_fhir_visit_occurrence_visit_so; Type: INDEX; Schema: cdm_ours_fhir; Owner: -
--

CREATE INDEX ix_cdm_ours_fhir_visit_occurrence_visit_so ON cdm_ours_fhir.visit_occurrence USING btree (visit_source_value);


--
-- PostgreSQL database dump complete
--


