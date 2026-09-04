--
-- PostgreSQL database dump
--

\restrict j2H6SnDebvD25e8ejOrkyifYeF4M5GTtryShtd45Spz4HNXEwgdTkO88WfD0tVI

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_contracts; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.action_contracts (
    action_id text NOT NULL,
    tenant_id text NOT NULL,
    policy_id text NOT NULL,
    policy_version integer NOT NULL,
    scope_refs jsonb NOT NULL,
    input_refs_json jsonb NOT NULL,
    decision text NOT NULL,
    confidence numeric(4,3) NOT NULL,
    payload_json jsonb NOT NULL,
    reason_codes_json jsonb,
    signature text NOT NULL,
    idempotency_key text NOT NULL,
    expires_at timestamp with time zone,
    contract_status text DEFAULT 'ACTIVE'::text NOT NULL,
    policy_family text,
    severity text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT action_contracts_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT action_contracts_contract_status_check CHECK ((contract_status = ANY (ARRAY['ACTIVE'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'DISMISSED'::text, 'EXPIRED'::text]))),
    CONSTRAINT action_contracts_decision_check CHECK ((decision = ANY (ARRAY['ALLOW'::text, 'ESCALATE'::text, 'NOTIFY'::text, 'HOLD'::text, 'RETRY'::text, 'GENERATE_EVIDENCE'::text, 'OPEN_OPS_INCIDENT'::text, 'ADVISORY_RECOMMENDATION'::text, 'PREPARE_AND_SIGN_RECOMMENDED'::text, 'DISPATCH_MODE_RECOMMENDED'::text, 'REQUEST_SOURCE_PATCH'::text, 'REVIEW_AMBIGUOUS_BATCH'::text, 'REGENERATE_EVIDENCE'::text, 'REQUEST_STRONGER_CARRIER_CONTRACT'::text])))
);


ALTER TABLE public.action_contracts OWNER TO zpi;

--
-- Name: actuation_outbox; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.actuation_outbox (
    event_id text NOT NULL,
    action_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT actuation_outbox_event_type_check CHECK ((event_type = ANY (ARRAY['ESCALATE'::text, 'RETRY'::text, 'GENERATE_EVIDENCE'::text, 'NOTIFY'::text, 'OPEN_OPS_INCIDENT'::text, 'HOLD'::text, 'ADVISORY_RECOMMENDATION'::text, 'BATCH_PATCH_REQUEST'::text, 'OPS_WEBHOOK'::text, 'PREPARE_AND_SIGN_RECOMMENDED'::text, 'DISPATCH_MODE_RECOMMENDED'::text, 'REQUEST_SOURCE_PATCH'::text, 'REVIEW_AMBIGUOUS_BATCH'::text, 'REGENERATE_EVIDENCE'::text, 'REQUEST_STRONGER_CARRIER_CONTRACT'::text]))),
    CONSTRAINT actuation_outbox_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'FAILED'::text])))
);


ALTER TABLE public.actuation_outbox OWNER TO zpi;

--
-- Name: batch_contracts; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.batch_contracts (
    batch_id text NOT NULL,
    tenant_id text NOT NULL,
    source_reference text,
    total_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    pending_count integer DEFAULT 0 NOT NULL,
    reversed_count integer DEFAULT 0 NOT NULL,
    partial_recon_count integer DEFAULT 0 NOT NULL,
    total_intended_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    total_confirmed_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    original_settled_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    total_variance_minor numeric(20,2) DEFAULT 0 NOT NULL,
    batch_finality_status text DEFAULT 'PROCESSING'::text NOT NULL,
    ambiguity_score numeric(4,3),
    match_confidence numeric(4,3),
    defensibility_tier text,
    intent_row_count integer DEFAULT 0 NOT NULL,
    intent_total_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    intent_amount_square_sum numeric(30,2) DEFAULT 0 NOT NULL,
    intent_min_amount_minor numeric(20,2),
    intent_max_amount_minor numeric(20,2),
    client_payout_ref_present_count integer DEFAULT 0 NOT NULL,
    batch_currency text,
    batch_source_system text,
    batch_rail text,
    batch_intent_type text,
    batch_provider_key text,
    first_intent_created_at timestamp with time zone,
    under_settlement_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    predicted_leakage_rate numeric(10,6),
    predicted_leakage_minor numeric(20,2),
    predicted_leakage_model_id text,
    predicted_at timestamp with time zone,
    unmatched_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    reversal_exposure_minor numeric(20,2) DEFAULT 0 NOT NULL,
    orphan_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    duplicate_risk_exposure_minor numeric(20,2) DEFAULT 0 NOT NULL,
    missing_ref_count integer DEFAULT 0 NOT NULL,
    unexplained_variance_minor numeric(20,2) DEFAULT 0 NOT NULL,
    whitelisted_deduction_minor numeric(20,2) DEFAULT 0 NOT NULL,
    settlement_ref_count integer DEFAULT 0 NOT NULL,
    bank_ref_present_count integer DEFAULT 0 NOT NULL,
    decision_ref_count integer DEFAULT 0 NOT NULL,
    client_ref_present_count integer DEFAULT 0 NOT NULL,
    total_intent_count integer DEFAULT 0 NOT NULL,
    matched_intent_count integer DEFAULT 0 NOT NULL,
    ambiguous_count integer DEFAULT 0 NOT NULL,
    unresolved_intent_count integer DEFAULT 0 NOT NULL,
    conflicted_count integer DEFAULT 0 NOT NULL,
    orphan_observation_count integer DEFAULT 0 NOT NULL,
    original_intended_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    ambiguous_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    unresolved_intended_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    conflicted_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    orphan_observed_amount_minor numeric(20,2) DEFAULT 0 NOT NULL,
    net_batch_delta_minor numeric(20,2) DEFAULT 0 NOT NULL,
    intent_count_coverage numeric(10,6) DEFAULT 0 NOT NULL,
    intent_value_coverage numeric(10,6) DEFAULT 0 NOT NULL,
    observed_count_allocation_coverage numeric(10,6) DEFAULT 0 NOT NULL,
    observed_value_allocation_coverage numeric(10,6) DEFAULT 0 NOT NULL,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT batch_contracts_batch_finality_status_check CHECK ((batch_finality_status = ANY (ARRAY['PROCESSING'::text, 'FULLY_RECONCILED'::text, 'PARTIALLY_RECONCILED'::text, 'FAILED'::text, 'REQUIRES_REVIEW'::text, 'CLOSED'::text]))),
    CONSTRAINT batch_contracts_defensibility_tier_check CHECK ((defensibility_tier = ANY (ARRAY['STRONG'::text, 'GOOD'::text, 'WEAK'::text, 'FRAGILE'::text, NULL::text])))
);


ALTER TABLE public.batch_contracts OWNER TO zpi;

--
-- Name: intelligence_explanations; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.intelligence_explanations (
    explanation_id text NOT NULL,
    tenant_id text NOT NULL,
    snapshot_id text NOT NULL,
    explanation_type text NOT NULL,
    input_refs_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    explanation_text text NOT NULL,
    model_version text DEFAULT 'deterministic_v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intelligence_explanations_explanation_type_check CHECK ((explanation_type = ANY (ARRAY['RCA_SUMMARY'::text, 'LEAKAGE_NARRATIVE'::text, 'AMBIGUITY_SUMMARY'::text, 'ACTION_JUSTIFICATION'::text, 'DEFENSIBILITY_REPORT'::text, 'BATCH_RISK_EXPLANATION'::text])))
);


ALTER TABLE public.intelligence_explanations OWNER TO zpi;

--
-- Name: intelligence_mode_config; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.intelligence_mode_config (
    id bigint NOT NULL,
    mode text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    initiated_by text DEFAULT 'system'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intelligence_mode_config_mode_check CHECK ((mode = ANY (ARRAY['GRADE_A'::text, 'GRADE_B'::text])))
);


ALTER TABLE public.intelligence_mode_config OWNER TO zpi;

--
-- Name: intelligence_mode_config_id_seq; Type: SEQUENCE; Schema: public; Owner: zpi
--

CREATE SEQUENCE public.intelligence_mode_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.intelligence_mode_config_id_seq OWNER TO zpi;

--
-- Name: intelligence_mode_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: zpi
--

ALTER SEQUENCE public.intelligence_mode_config_id_seq OWNED BY public.intelligence_mode_config.id;


--
-- Name: intelligence_snapshots; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.intelligence_snapshots (
    snapshot_id text NOT NULL,
    tenant_id text NOT NULL,
    snapshot_type text NOT NULL,
    scope_type text NOT NULL,
    scope_ref text,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    projection_refs_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    snapshot_json jsonb NOT NULL,
    model_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intelligence_snapshots_scope_type_check CHECK ((scope_type = ANY (ARRAY['TENANT'::text, 'BATCH'::text, 'CORRIDOR'::text, 'PSP'::text, 'SOURCE'::text, 'INTENT'::text]))),
    CONSTRAINT intelligence_snapshots_snapshot_type_check CHECK ((snapshot_type = ANY (ARRAY['LEAKAGE'::text, 'AMBIGUITY'::text, 'DEFENSIBILITY'::text, 'RCA'::text, 'RCA_CLUSTER'::text, 'PATTERN'::text, 'RECOMMENDATION'::text])))
);


ALTER TABLE public.intelligence_snapshots OWNER TO zpi;

--
-- Name: ml_feature_store; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.ml_feature_store (
    feature_row_id text NOT NULL,
    tenant_id text NOT NULL,
    scope_type text NOT NULL,
    scope_ref text NOT NULL,
    feature_family text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    features_json jsonb NOT NULL,
    label_json jsonb,
    model_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_feature_store_feature_family_check CHECK ((feature_family = ANY (ARRAY['LEAKAGE'::text, 'AMBIGUITY'::text, 'RCA'::text, 'PATTERN'::text, 'SLA'::text]))),
    CONSTRAINT ml_feature_store_scope_type_check CHECK ((scope_type = ANY (ARRAY['INTENT'::text, 'BATCH'::text, 'CORRIDOR'::text, 'TENANT'::text, 'PSP'::text])))
);


ALTER TABLE public.ml_feature_store OWNER TO zpi;

--
-- Name: ml_labels; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.ml_labels (
    label_id text NOT NULL,
    tenant_id text NOT NULL,
    scope_type text NOT NULL,
    scope_ref text NOT NULL,
    label_family text NOT NULL,
    label_value double precision NOT NULL,
    label_confidence double precision DEFAULT 1.0 NOT NULL,
    label_source text NOT NULL,
    source_refs_json jsonb,
    feature_row_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_labels_label_family_check CHECK ((label_family = ANY (ARRAY['LEAKAGE'::text, 'AMBIGUITY'::text, 'FAILURE'::text, 'DUPLICATE'::text, 'SLA_BREACH'::text, 'DEFENSIBILITY'::text]))),
    CONSTRAINT ml_labels_scope_type_check CHECK ((scope_type = ANY (ARRAY['INTENT'::text, 'BATCH'::text, 'PROVIDER'::text, 'CORRIDOR'::text, 'SOURCE_SYSTEM'::text, 'TENANT'::text])))
);


ALTER TABLE public.ml_labels OWNER TO zpi;

--
-- Name: ml_model_registry; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.ml_model_registry (
    model_id text NOT NULL,
    model_name text NOT NULL,
    model_family text NOT NULL,
    algorithm text NOT NULL,
    target_label text NOT NULL,
    feature_version text DEFAULT 'v1'::text NOT NULL,
    training_window_start timestamp with time zone,
    training_window_end timestamp with time zone,
    hyperparameters_json jsonb,
    metrics_json jsonb,
    status text DEFAULT 'CANDIDATE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    CONSTRAINT ml_model_registry_model_family_check CHECK ((model_family = ANY (ARRAY['LEAKAGE'::text, 'AMBIGUITY'::text, 'DEFENSIBILITY'::text, 'PATTERN'::text, 'RECOMMENDATION'::text]))),
    CONSTRAINT ml_model_registry_status_check CHECK ((status = ANY (ARRAY['CANDIDATE'::text, 'SHADOW'::text, 'ACTIVE'::text, 'RETIRED'::text])))
);


ALTER TABLE public.ml_model_registry OWNER TO zpi;

--
-- Name: ml_predictions; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.ml_predictions (
    prediction_id text NOT NULL,
    tenant_id text NOT NULL,
    model_id text NOT NULL,
    scope_type text NOT NULL,
    scope_ref text NOT NULL,
    prediction_family text NOT NULL,
    prediction_value text NOT NULL,
    prediction_score double precision NOT NULL,
    confidence double precision DEFAULT 1.0 NOT NULL,
    feature_row_id text,
    explanation_json jsonb,
    snapshot_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_predictions_prediction_family_check CHECK ((prediction_family = ANY (ARRAY['LEAKAGE'::text, 'AMBIGUITY'::text, 'DEFENSIBILITY'::text, 'PATTERN'::text, 'RECOMMENDATION'::text]))),
    CONSTRAINT ml_predictions_scope_type_check CHECK ((scope_type = ANY (ARRAY['INTENT'::text, 'BATCH'::text, 'PROVIDER'::text, 'CORRIDOR'::text, 'SOURCE_SYSTEM'::text, 'TENANT'::text])))
);


ALTER TABLE public.ml_predictions OWNER TO zpi;

--
-- Name: policy_registry; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.policy_registry (
    policy_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    scope_type text NOT NULL,
    trigger_type text NOT NULL,
    trigger_value text NOT NULL,
    dsl text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    tenant_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    policy_family text,
    severity text DEFAULT 'MEDIUM'::text,
    requires_manual_approval boolean DEFAULT false NOT NULL,
    CONSTRAINT policy_registry_scope_type_check CHECK ((scope_type = ANY (ARRAY['tenant'::text, 'corridor'::text, 'contract'::text]))),
    CONSTRAINT policy_registry_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['event'::text, 'cron'::text])))
);


ALTER TABLE public.policy_registry OWNER TO zpi;

--
-- Name: processed_events; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.processed_events (
    tenant_id text NOT NULL,
    event_id text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.processed_events OWNER TO zpi;

--
-- Name: processed_finality; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.processed_finality (
    tenant_id text NOT NULL,
    certificate_id text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.processed_finality OWNER TO zpi;

--
-- Name: projection_state; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.projection_state (
    id bigint NOT NULL,
    tenant_id text NOT NULL,
    projection_key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    value_json jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    projection_version integer DEFAULT 1 NOT NULL,
    projection_family text,
    entity_scope_type text,
    entity_scope_ref text,
    source_refs_json jsonb,
    freshness_ts timestamp with time zone
);


ALTER TABLE public.projection_state OWNER TO zpi;

--
-- Name: projection_state_id_seq; Type: SEQUENCE; Schema: public; Owner: zpi
--

CREATE SEQUENCE public.projection_state_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projection_state_id_seq OWNER TO zpi;

--
-- Name: projection_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: zpi
--

ALTER SEQUENCE public.projection_state_id_seq OWNED BY public.projection_state.id;


--
-- Name: sla_timers; Type: TABLE; Schema: public; Owner: zpi
--

CREATE TABLE public.sla_timers (
    id bigint NOT NULL,
    intent_id text NOT NULL,
    tenant_id text NOT NULL,
    corridor_id text NOT NULL,
    sla_deadline timestamp with time zone NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    resolved_at timestamp with time zone,
    notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sla_timers_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'RESOLVED'::text, 'BREACHED'::text])))
);


ALTER TABLE public.sla_timers OWNER TO zpi;

--
-- Name: sla_timers_id_seq; Type: SEQUENCE; Schema: public; Owner: zpi
--

CREATE SEQUENCE public.sla_timers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sla_timers_id_seq OWNER TO zpi;

--
-- Name: sla_timers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: zpi
--

ALTER SEQUENCE public.sla_timers_id_seq OWNED BY public.sla_timers.id;


--
-- Name: intelligence_mode_config id; Type: DEFAULT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.intelligence_mode_config ALTER COLUMN id SET DEFAULT nextval('public.intelligence_mode_config_id_seq'::regclass);


--
-- Name: projection_state id; Type: DEFAULT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.projection_state ALTER COLUMN id SET DEFAULT nextval('public.projection_state_id_seq'::regclass);


--
-- Name: sla_timers id; Type: DEFAULT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.sla_timers ALTER COLUMN id SET DEFAULT nextval('public.sla_timers_id_seq'::regclass);


--
-- Name: action_contracts action_contracts_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.action_contracts
    ADD CONSTRAINT action_contracts_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: action_contracts action_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.action_contracts
    ADD CONSTRAINT action_contracts_pkey PRIMARY KEY (action_id);


--
-- Name: actuation_outbox actuation_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.actuation_outbox
    ADD CONSTRAINT actuation_outbox_pkey PRIMARY KEY (event_id);


--
-- Name: batch_contracts batch_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.batch_contracts
    ADD CONSTRAINT batch_contracts_pkey PRIMARY KEY (batch_id);


--
-- Name: intelligence_explanations intelligence_explanations_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.intelligence_explanations
    ADD CONSTRAINT intelligence_explanations_pkey PRIMARY KEY (explanation_id);


--
-- Name: intelligence_mode_config intelligence_mode_config_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.intelligence_mode_config
    ADD CONSTRAINT intelligence_mode_config_pkey PRIMARY KEY (id);


--
-- Name: intelligence_snapshots intelligence_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.intelligence_snapshots
    ADD CONSTRAINT intelligence_snapshots_pkey PRIMARY KEY (snapshot_id);


--
-- Name: ml_feature_store ml_feature_store_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.ml_feature_store
    ADD CONSTRAINT ml_feature_store_pkey PRIMARY KEY (feature_row_id);


--
-- Name: ml_labels ml_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.ml_labels
    ADD CONSTRAINT ml_labels_pkey PRIMARY KEY (label_id);


--
-- Name: ml_model_registry ml_model_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.ml_model_registry
    ADD CONSTRAINT ml_model_registry_pkey PRIMARY KEY (model_id);


--
-- Name: ml_predictions ml_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.ml_predictions
    ADD CONSTRAINT ml_predictions_pkey PRIMARY KEY (prediction_id);


--
-- Name: policy_registry policy_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.policy_registry
    ADD CONSTRAINT policy_registry_pkey PRIMARY KEY (policy_id);


--
-- Name: processed_events processed_events_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.processed_events
    ADD CONSTRAINT processed_events_pkey PRIMARY KEY (tenant_id, event_id);


--
-- Name: processed_finality processed_finality_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.processed_finality
    ADD CONSTRAINT processed_finality_pkey PRIMARY KEY (tenant_id, certificate_id);


--
-- Name: projection_state projection_state_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.projection_state
    ADD CONSTRAINT projection_state_pkey PRIMARY KEY (id);


--
-- Name: sla_timers sla_timers_pkey; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.sla_timers
    ADD CONSTRAINT sla_timers_pkey PRIMARY KEY (id);


--
-- Name: projection_state uq_projection; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.projection_state
    ADD CONSTRAINT uq_projection UNIQUE (tenant_id, projection_key, window_start, projection_version);


--
-- Name: sla_timers uq_sla_intent; Type: CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.sla_timers
    ADD CONSTRAINT uq_sla_intent UNIQUE (tenant_id, intent_id);


--
-- Name: idx_ac_expired; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_expired ON public.action_contracts USING btree (expires_at) WHERE ((contract_status = 'PENDING_APPROVAL'::text) AND (expires_at IS NOT NULL));


--
-- Name: idx_ac_family_created; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_family_created ON public.action_contracts USING btree (tenant_id, policy_family, created_at DESC) WHERE (policy_family IS NOT NULL);


--
-- Name: idx_ac_pending_approval; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_pending_approval ON public.action_contracts USING btree (tenant_id, created_at DESC) WHERE (contract_status = 'PENDING_APPROVAL'::text);


--
-- Name: idx_ac_policy; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_policy ON public.action_contracts USING btree (policy_id, tenant_id, created_at DESC);


--
-- Name: idx_ac_scope_refs; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_scope_refs ON public.action_contracts USING gin (scope_refs);


--
-- Name: idx_ac_severity_status; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_severity_status ON public.action_contracts USING btree (tenant_id, severity, contract_status) WHERE (severity IS NOT NULL);


--
-- Name: idx_ac_status_created; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_status_created ON public.action_contracts USING btree (contract_status, created_at DESC);


--
-- Name: idx_ac_tenant_created; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ac_tenant_created ON public.action_contracts USING btree (tenant_id, created_at DESC);


--
-- Name: idx_batch_ambiguity; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_batch_ambiguity ON public.batch_contracts USING btree (tenant_id, ambiguity_score DESC) WHERE (ambiguity_score IS NOT NULL);


--
-- Name: idx_batch_status; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_batch_status ON public.batch_contracts USING btree (tenant_id, batch_finality_status) WHERE (batch_finality_status = ANY (ARRAY['REQUIRES_REVIEW'::text, 'PARTIALLY_RECONCILED'::text, 'FAILED'::text]));


--
-- Name: idx_batch_tenant_amount; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_batch_tenant_amount ON public.batch_contracts USING btree (tenant_id, total_intended_amount_minor DESC NULLS LAST);


--
-- Name: idx_batch_tenant_updated; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_batch_tenant_updated ON public.batch_contracts USING btree (tenant_id, last_updated_at DESC);


--
-- Name: idx_expl_snapshot; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_expl_snapshot ON public.intelligence_explanations USING btree (snapshot_id, created_at DESC);


--
-- Name: idx_expl_tenant_type; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_expl_tenant_type ON public.intelligence_explanations USING btree (tenant_id, explanation_type, created_at DESC);


--
-- Name: idx_feat_scope; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_feat_scope ON public.ml_feature_store USING btree (tenant_id, scope_type, scope_ref, feature_family, window_end DESC);


--
-- Name: idx_feat_unlabeled; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_feat_unlabeled ON public.ml_feature_store USING btree (tenant_id, feature_family, created_at DESC) WHERE (label_json IS NULL);


--
-- Name: idx_intelligence_snapshots_rca_cluster; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_intelligence_snapshots_rca_cluster ON public.intelligence_snapshots USING btree (tenant_id, snapshot_type, scope_type, scope_ref, created_at DESC) WHERE (snapshot_type = 'RCA_CLUSTER'::text);


--
-- Name: idx_ml_labels_scope; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ml_labels_scope ON public.ml_labels USING btree (tenant_id, scope_type, scope_ref, label_family);


--
-- Name: idx_ml_labels_tenant_family; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ml_labels_tenant_family ON public.ml_labels USING btree (tenant_id, label_family, created_at DESC);


--
-- Name: idx_ml_model_family_status; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ml_model_family_status ON public.ml_model_registry USING btree (model_family, status, created_at DESC);


--
-- Name: idx_ml_model_one_active_per_family; Type: INDEX; Schema: public; Owner: zpi
--

CREATE UNIQUE INDEX idx_ml_model_one_active_per_family ON public.ml_model_registry USING btree (model_family) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_ml_predictions_scope; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ml_predictions_scope ON public.ml_predictions USING btree (tenant_id, scope_type, scope_ref, prediction_family, created_at DESC);


--
-- Name: idx_ml_predictions_tenant_family; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_ml_predictions_tenant_family ON public.ml_predictions USING btree (tenant_id, prediction_family, created_at DESC);


--
-- Name: idx_mode_config_current; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_mode_config_current ON public.intelligence_mode_config USING btree (is_current, started_at DESC) WHERE (is_current = true);


--
-- Name: idx_mode_config_history; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_mode_config_history ON public.intelligence_mode_config USING btree (started_at DESC);


--
-- Name: idx_outbox_pending; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_outbox_pending ON public.actuation_outbox USING btree (next_retry_at) WHERE (status = ANY (ARRAY['PENDING'::text, 'FAILED'::text]));


--
-- Name: idx_policy_enabled_trigger; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_policy_enabled_trigger ON public.policy_registry USING btree (trigger_type, trigger_value) WHERE (enabled = true);


--
-- Name: idx_policy_family; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_policy_family ON public.policy_registry USING btree (policy_family, enabled) WHERE (policy_family IS NOT NULL);


--
-- Name: idx_processed_events_at; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_processed_events_at ON public.processed_events USING btree (processed_at DESC);


--
-- Name: idx_processed_finality_at; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_processed_finality_at ON public.processed_finality USING btree (processed_at DESC);


--
-- Name: idx_proj_family_computed; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_proj_family_computed ON public.projection_state USING btree (tenant_id, projection_family, computed_at DESC) WHERE (projection_family IS NOT NULL);


--
-- Name: idx_proj_family_scope; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_proj_family_scope ON public.projection_state USING btree (tenant_id, projection_family, entity_scope_type, entity_scope_ref) WHERE (projection_family IS NOT NULL);


--
-- Name: idx_proj_key_computed; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_proj_key_computed ON public.projection_state USING btree (tenant_id, projection_key, computed_at DESC);


--
-- Name: idx_proj_tenant_key; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_proj_tenant_key ON public.projection_state USING btree (tenant_id, projection_key, window_end DESC);


--
-- Name: idx_projection_state_rca_frag; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_projection_state_rca_frag ON public.projection_state USING btree (tenant_id, projection_key text_pattern_ops) WHERE (projection_key ~~ 'rca.frag.%'::text);


--
-- Name: idx_sla_active_deadline; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_sla_active_deadline ON public.sla_timers USING btree (tenant_id, sla_deadline) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_snap_latest_by_type; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_snap_latest_by_type ON public.intelligence_snapshots USING btree (tenant_id, snapshot_type, scope_type, created_at DESC);


--
-- Name: idx_snap_scope; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_snap_scope ON public.intelligence_snapshots USING btree (tenant_id, scope_type, scope_ref, window_end DESC) WHERE (scope_ref IS NOT NULL);


--
-- Name: idx_snap_tenant_type_recent; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_snap_tenant_type_recent ON public.intelligence_snapshots USING btree (tenant_id, snapshot_type, created_at DESC) WHERE (snapshot_type = ANY (ARRAY['LEAKAGE'::text, 'AMBIGUITY'::text, 'DEFENSIBILITY'::text, 'RCA'::text, 'PATTERN'::text, 'RECOMMENDATION'::text]));


--
-- Name: idx_snap_tenant_type_window; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_snap_tenant_type_window ON public.intelligence_snapshots USING btree (tenant_id, snapshot_type, window_end DESC);


--
-- Name: idx_snapshots_latest; Type: INDEX; Schema: public; Owner: zpi
--

CREATE INDEX idx_snapshots_latest ON public.intelligence_snapshots USING btree (tenant_id, snapshot_type, created_at DESC);


--
-- Name: actuation_outbox actuation_outbox_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.actuation_outbox
    ADD CONSTRAINT actuation_outbox_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.action_contracts(action_id);


--
-- Name: intelligence_explanations intelligence_explanations_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: zpi
--

ALTER TABLE ONLY public.intelligence_explanations
    ADD CONSTRAINT intelligence_explanations_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.intelligence_snapshots(snapshot_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict j2H6SnDebvD25e8ejOrkyifYeF4M5GTtryShtd45Spz4HNXEwgdTkO88WfD0tVI

