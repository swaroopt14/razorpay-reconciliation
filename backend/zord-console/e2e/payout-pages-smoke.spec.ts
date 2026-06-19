import { test, expect, type BrowserContext, type Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const SESSION_TENANT = 'e2e-session-tenant-111'
const BATCH_ID = 'e2e-batch-222'

const EVIDENCE_BATCH = 'e2e-evidence-batch'
const INTENT_A = 'e2e-intent-aaa'
const INTENT_B = 'e2e-intent-bbb'
const PACK_BATCH = 'pack-batch-001'
const PACK_INTENT_A = 'pack-intent-a'
const PACK_INTENT_B = 'pack-intent-b'

/** Live payout console docks (excludes sandbox-only). */
const DOCK_CASES: { dock: string; title: string }[] = [
  { dock: 'home', title: 'Payment Command Center' },
  { dock: 'workspace', title: 'Payment Operations View' },
  { dock: 'leakage', title: 'Payment Gaps & Value at Risk' },
  { dock: 'ambiguity', title: 'Match Review' },
  { dock: 'verification', title: 'Borrower Verification' },
  { dock: 'monitoring', title: 'Post-Disbursal Monitoring' },
  { dock: 'grid', title: 'Intent Journal' },
  { dock: 'settlement', title: 'Settlement Journal' },
  { dock: 'connectors', title: 'Connector Performance & Leakage' },
  { dock: 'proof', title: 'Evidence & Dispute Resolution' },
  { dock: 'billing', title: 'Billing' },
]

const STANDALONE_ROUTES = [
  '/payout-command-view/batch-command-center',
  '/payout-command-view/connector-intelligence',
  `/payout-command-view/evidence-pack/${PACK_BATCH}?tab=graph&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`,
  '/payout-command-view/settings/account',
  '/payout-command-view/settings/api-keys',
]

type ProdCapture = { pathname: string; searchParams: URLSearchParams }

function captureProdGet(url: string): ProdCapture | null {
  try {
    const u = new URL(url)
    if (!u.pathname.startsWith('/api/prod/')) return null
    return { pathname: u.pathname, searchParams: u.searchParams }
  } catch {
    return null
  }
}

async function installPayoutSessionCookies(context: BrowserContext) {
  const parsed = new URL(BASE_URL)
  const port = parsed.port ? `:${parsed.port}` : ''
  const origins = new Set<string>([
    `${parsed.protocol}//${parsed.hostname}${port}`,
    `${parsed.protocol}//localhost${port}`,
    `${parsed.protocol}//127.0.0.1${port}`,
  ])
  const cookies = [...origins].flatMap((url) => ([
    { name: 'zord_access_token', value: 'e2e-playwright-access', url },
    { name: 'zord_refresh_token', value: 'e2e-playwright-refresh', url },
    { name: 'zord_role', value: 'CUSTOMER_USER', url },
    { name: 'zord_session_present', value: '1', url },
  ]))
  await context.addCookies(cookies)
}

function packSummary(
  packId: string,
  opts: {
    intentId?: string
    batchId?: string
    mode: string
    ref?: string
    leafCount?: number
    requiredLeafCount?: number
  },
) {
  const hasSettlement = (opts.leafCount ?? 4) > 0
  const hasAttachment = opts.intentId === INTENT_A ? false : true
  return {
    evidence_pack_id: packId,
    tenant_id: SESSION_TENANT,
    intent_id: opts.intentId,
    batch_id: opts.batchId,
    client_reference: opts.ref ?? packId,
    client_payout_ref: opts.ref ?? packId,
    mode: opts.mode,
    pack_status: 'READY',
    merkle_root: 'a'.repeat(64),
    ruleset_version: '1',
    created_at: '2026-05-01T12:00:00Z',
    proof_status: 'CERTIFIED',
    proof_score: 100,
    leaf_count: opts.leafCount ?? 4,
    required_leaf_count: opts.requiredLeafCount,
    artifact_count: opts.leafCount ?? 4,
    pack_completeness_score: 1,
    settlement_leaf_present_flag: hasSettlement,
    attachment_decision_leaf_present_flag: hasAttachment,
    governance_decision: 'Pass',
    settlement_record_received: '2026-05-01T12:00:02Z',
    canonical_settlement_created: '2026-05-01T12:00:03Z',
    bank_reference: opts.intentId === INTENT_A ? 'UTR-CONFLICT-A' : 'UTR-OK-B',
    attachment_decision: 'MATCH_EXACT',
    match_confidence: 0.9675,
    value_date_check: true,
    amount_match: true,
    verification_status: false,
    proof_components: {
      payment_instruction_available: true,
      settlement_record_available: true,
      match_decision_available: hasAttachment,
      governance_decision_available: true,
      replay_check_passed: true,
    },
  }
}

function packFull(packId: string, intentId: string, mode: string) {
  const hasAttachment = intentId === INTENT_A ? false : true
  return {
    evidence_pack_id: packId,
    tenant_id: SESSION_TENANT,
    intent_id: intentId,
    contract_id: 'contract-smoke',
    mode,
    pack_status: 'READY',
    items: [
      { type: 'CANONICAL_INTENT_HASH', ref: intentId, schema_version: 'v1', hash: 'h1', leaf_hash: 'lh1' },
      { type: 'RAW_SETTLEMENT_LINE', ref: `line-${intentId}`, schema_version: 'v1', hash: 'h2', leaf_hash: 'lh2' },
      { type: 'CANONICAL_SETTLEMENT_OBSERVATION', ref: `set-${intentId}`, schema_version: 'v1', hash: 'h3', leaf_hash: 'lh3' },
      { type: 'ATTACHMENT_DECISION', ref: `att-${intentId}`, schema_version: 'v1', hash: 'h4', leaf_hash: 'lh4' },
      { type: 'VARIANCE_DECISION', ref: `var-${intentId}`, schema_version: 'v1', hash: 'h5', leaf_hash: 'lh5' },
      { type: 'ENVELOPE_HASH', ref: `env-${intentId}`, schema_version: 'v1', hash: 'h6', leaf_hash: 'lh6' },
      { type: 'GOVERNANCE_DECISION_AT_CANONICAL', ref: intentId, schema_version: 'v1', hash: 'h7', leaf_hash: 'lh7' },
      { type: 'RAW_SETTLEMENT_FILE', ref: `raw-${intentId}`, schema_version: 'v1', hash: 'h8', leaf_hash: 'lh8' },
      { type: 'FINAL_EVIDENCE_VIEW', ref: packId, schema_version: 'v1', hash: 'h9', leaf_hash: 'lh9' },
    ],
    merkle_root: 'b'.repeat(64),
    ruleset_version: '1',
    schema_versions: {
      attachment_schema: 'v1',
      contract_schema: 'v1',
      intent_schema: 'v1',
      outcome_schema: 'v1',
    },
    signatures: [
      {
        signer: 'zord_evidence',
        alg: 'ed25519',
        sig: 'sig',
        signed_at: '2026-05-01T12:00:10Z',
      },
    ],
    pack_completeness_score: 1,
    leaf_count: 9,
    required_leaf_count: 5,
    settlement_leaf_present_flag: true,
    attachment_decision_leaf_present_flag: hasAttachment,
    payment_instruction_received: '2026-05-01T12:00:00Z',
    canonical_intent_created: '2026-05-01T12:00:01Z',
    mapping_profile_used: 'auto-generic-test-v1',
    required_fields_status: true,
    tokenization_status: true,
    governance_decision: 'Fail',
    settlement_record_received: '2026-05-01T12:00:02Z',
    canonical_settlement_created: '2026-05-01T12:00:03Z',
    bank_reference: 'UTR172777748433',
    client_reference: intentId === INTENT_A ? 'ZORD_PAY_CONFLICT_A' : 'ZORD_PAY_OK_B',
    attachment_decision: 'MATCH_EXACT',
    match_confidence: 0.9675,
    value_date_check: true,
    amount_match: false,
    created_at: '2026-05-01T12:00:00Z',
    proof_status: 'CERTIFIED',
    proof_score: 100,
    proof_score_breakdown: {
      score: 100,
      components: [
        { check: 'Original Payment Instruction', weight: 20, passed: true, deduction: 0 },
        { check: 'Settlement / Bank Record', weight: 20, passed: true, deduction: 0 },
        { check: 'Match Decision', weight: 20, passed: true, deduction: 0 },
      ],
      deductions: null,
    },
    generated_by: 'system',
    verification_status: false,
    export_count: 0,
    proof_components: {
      payment_instruction_available: true,
      settlement_record_available: true,
      match_decision_available: hasAttachment,
      governance_decision_available: true,
      replay_check_passed: true,
    },
    cryptographic_signatures: {
      raw_intent_hash: 'raw-intent-hash',
      raw_settlement_hash: 'raw-settlement-hash',
      canonical_settlement_hash: 'canonical-settlement-hash',
      attachment_decision_hash: 'attachment-decision-hash',
      governance_decision_hash: 'governance-decision-hash',
      final_evidence_view_hash: 'final-evidence-view-hash',
    },
  }
}

function emptyProdBody(path: string): unknown {
  if (path.endsWith('/intents/batch-ids')) {
    return { items: [{ batch_id: BATCH_ID, intent_count: 0 }] }
  }
  if (path.endsWith('/intelligence/batches')) {
    return { tenant_id: SESSION_TENANT, batches: [{ batch_id: BATCH_ID, finality_status: 'OPEN', total_count: 1 }] }
  }
  if (path.includes('/intelligence/batches/')) {
    return {
      tenant_id: SESSION_TENANT,
      intelligence_mode: 'GRADE_A',
      batch: {
        batch_id: BATCH_ID,
        tenant_id: SESSION_TENANT,
        total_count: 20,
        success_count: 18,
        failed_count: 1,
        pending_count: 1,
        total_confirmed_amount_minor: 52_653.42,
        total_variance_minor: -388.32,
        missing_ref_count: 0,
        settlement_ref_count: 20,
        ambiguity_score: 0.75,
      },
      batch_health: {
        total_confirmed_amount_minor: 52_653.42,
        total_variance_minor: -388.32,
        total_intended_amount_minor: 53_041.74,
        ambiguity_score: 0.75,
        finality_status: 'FULLY_SETTLED',
      },
    }
  }
  if (path.includes('/intelligence/batch_contract/')) {
    return {
      tenant_id: SESSION_TENANT,
      intelligence_mode: 'GRADE_A',
      batch_id: BATCH_ID,
      bank_reference_coverage: '100.00%',
      settlement_ref_count: 20,
      bank_ref_present_count: 20,
      client_ref_present_count: 20,
      client_reference_coverage: '100.00%',
      variance_amount: -388.32,
      orphan_amount: 22_381.29,
      unmatch_amount: 0,
      total_confirmed_amount: 52_653.42,
      match_confidence: 0.75,
      missing_reference_rate: '0.00%',
    }
  }
  if (path.endsWith('/intents/payment-intents') || path.endsWith('/intents/dlq-items')) {
    return { items: [] }
  }
  if (path.endsWith('/evidence/packs')) {
    return { packs: [], total: 0 }
  }
  if (/\/evidence\/batch\/[^/]+\/intents$/.test(path)) {
    return { packs: [], total: 0 }
  }
  if (path.endsWith('/intelligence/timeseries/leakage')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      computed_at: '2026-06-09T16:06:41.126247Z',
      window_start: '2026-06-09T00:00:00Z',
      window_end: '2026-06-09T00:00:00Z',
      granularity: 'day',
      series: [
        {
          date: '2026-06-09',
          current_leakage_minor: 5_714_479.85,
          predicted_leakage_minor: 13_498_147,
        },
      ],
    }
  }
  if (path.endsWith('/intelligence/leakage')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      computed_at: '2026-06-02T07:00:00Z',
      total_intended_amount_minor: 5_000_000,
      unmatched_amount_minor: 120_000,
      under_settlement_amount_minor: 80_000,
      orphan_amount_minor: 0,
      reversal_exposure_minor: 0,
      total_observed_settled_amount_minor: 4_200_000,
      leakage_percentage: 0.04,
      risk_tier: 'MEDIUM',
    }
  }
  if (path.endsWith('/intelligence/ambiguity/heatmap')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      batches: [
        {
          batch_id: 'route-batch-a',
          total_count: 100,
          exact_match_count: 62,
          high_confidence_count: 26,
          ambiguous_count: 8,
          unresolved_count: 3,
          conflicted_count: 1,
          aggregate_score: 0.88,
        },
        {
          batch_id: 'route-batch-b',
          total_count: 100,
          exact_match_count: 68,
          high_confidence_count: 22,
          ambiguous_count: 6,
          unresolved_count: 3,
          conflicted_count: 1,
          aggregate_score: 0.9,
        },
      ],
    }
  }
  if (path.endsWith('/intelligence/ambiguity')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      computed_at: '2026-06-02T07:00:00Z',
      value_at_risk_minor: 250_000,
      avg_attachment_confidence: 0.82,
      provider_ref_missing_rate: 0.16,
      ambiguous_intent_count: 12,
      ambiguity_rate: 0.08,
      clearing_pct: 82,
      ambiguity_mix_segments: [
        { name: 'High Confidence', pct: 68 },
        { name: 'Low Confidence', pct: 8 },
        { name: 'Ambiguous', pct: 8 },
        { name: 'Missing Refs', pct: 16 },
      ],
    }
  }
  if (path.endsWith('/intelligence/recommendations')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      computed_at: '2026-06-02T07:00:00Z',
      total_actions: 3,
      accepted_actions: 1,
      resolved_actions: 1,
      action_acceptance_rate: 0.33,
      action_resolution_rate: 0.33,
      recommendation_impact_estimate_minor: 300_000,
    }
  }
  if (path.endsWith('/intelligence/pattern/history')) {
    return {
      count: 1,
      intelligence_mode: 'GRADE_A',
      snapshot_type: 'PATTERN',
      snapshots: [
        {
          created_at: '2026-06-02T07:00:00Z',
          snapshot_json: {
            weakest_source_system: 'manual_excel',
            weakest_source_missing_ref_rate: 0.42,
            weakest_provider_id: 'cashfree',
          },
        },
      ],
    }
  }
  if (path.endsWith('/intelligence/patterns')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      computed_at: '2026-06-02T07:00:00Z',
      decision_success_rate: '64.95%',
      by_provider: {
        cashfree: {
          total_decisions: 25,
          successful_decision_count: 22,
          decision_success_rate: '88.00%',
          ambiguity_rate: '0.00%',
          unresolved_decisions: 0,
          orphan_rate: '20.00%',
        },
        razorpay: {
          total_decisions: 17,
          successful_decision_count: 15,
          decision_success_rate: '88.24%',
          ambiguity_rate: '0.00%',
          unresolved_decisions: 0,
          orphan_rate: '5.88%',
        },
      },
      batch_anomaly_score: 0.31,
      anomaly_level: 'MEDIUM',
      batch_risk_score: 0.39,
      risk_tier: 'MEDIUM',
      finality_status: 'FULLY_SETTLED',
      total_count: 100,
      success_count: 82,
      failed_count: 4,
      pending_count: 14,
    }
  }
  if (path.endsWith('/intelligence/pattern')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      snapshot_type: 'PATTERN',
      snapshot_id: 'snap-pattern-e2e',
      scope_type: 'BATCH',
      scope_ref: BATCH_ID,
      window_start: '2026-06-01T00:00:00Z',
      window_end: '2026-06-02T07:00:00Z',
      computed_at: '2026-06-02T07:00:00Z',
      model_version: 'deterministic-v1',
      intelligence_mode: 'GRADE_A',
      data: {
        batch_id: BATCH_ID,
        risk_tier: 'HIGH',
        anomaly_level: 'ELEVATED',
        finality_status: 'PARTIALLY_SETTLED',
        batch_anomaly_score: 0.71,
        batch_quality_score: 0.62,
        batch_risk_score: 0.68,
        total_count: 120,
        success_count: 88,
        failed_count: 6,
        pending_count: 26,
        ambiguity_score: 0.24,
        ambiguous_count: 14,
        unresolved_count: 9,
        conflicted_count: 3,
        exact_match_count: 52,
        high_confidence_count: 36,
        prepare_and_sign_recommended: true,
        recommended_action: 'Review ambiguous batch before dispatch',
        duplicate_risk_rate: 0.12,
        duplicate_risk_exposure_minor: 420_000,
        unexplained_variance_amount_minor: 75_000,
        whitelisted_deduction_amount_minor: 12_000,
        over_settlement_amount_minor: 8_000,
        missing_leaf_rate: 0.09,
        weak_evidence_rate: 0.11,
        evidence_pack_coverage: 0.81,
        tenant_manual_review_rate: 0.22,
        settlement_delay_p50_days: 1.2,
        settlement_delay_p95_days: 2,
        computed_at: '2026-06-02T07:00:00Z',
        weakest_source_system: 'manual_excel',
        weakest_source_missing_ref_rate: 0.42,
        weakest_source_manual_review_rate: 0.31,
        weakest_provider_id: 'cashfree',
        risk_signals: [
          { signal: 'missing_client_ref_rate', severity: 'HIGH', value: 0.42, threshold: 0.2, contribution: 0.35 },
        ],
        top_manual_review_reasons: [
          { reason_code: 'MISSING_CLIENT_REF', count: 12, rate: 0.18 },
        ],
        source_quality_patterns: [
          {
            severity: 'HIGH',
            source_system: 'manual_excel',
            manual_review_rate: 0.31,
            missing_client_ref_rate: 0.42,
            low_matchability_rate: 0.4,
            duplicate_risk_rate: 0.12,
            manual_review_amount_minor: 500_000,
          },
        ],
        provider_quality_patterns: [
          {
            severity: 'CRITICAL',
            provider_id: 'cashfree',
            orphan_rate: 0.24,
            ambiguity_rate: 0.05,
            avg_carrier_richness: 0.42,
            avg_parse_confidence: 0.59,
            settlement_delay_p95_days: 2,
          },
        ],
      },
    }
  }
  if (path.endsWith('/ambiguity/velocity') || path.endsWith('/dashboard/bubble-map')) {
    return {
      data_available: true,
      tenant_id: SESSION_TENANT,
      intelligence_mode: 'GRADE_A',
      count: 3,
      batches: [
        { batch_id: 'batch_live_001', amount_value: 2_000_000, amount_at_risk: 245_000 },
        { batch_id: 'batch_002', amount_value: 750_000, amount_at_risk: 12_000 },
        { batch_id: 'batch_003', amount_value: 5_000_000, amount_at_risk: 115_000 },
      ],
    }
  }
  if (path.endsWith('/settlement/observations/batches')) {
    return {
      items: [{ client_batch_id: BATCH_ID }],
      pagination: { page: 1, page_size: 20, total: 1 },
    }
  }
  if (path.endsWith('/settlement/errors')) {
    return {
      items: [
        { source_row_ref: '2', error_stage: 'PARSING', reason_code: 'EMPTY_RAW_ROW', severity: 'LOW' },
      ],
      pagination: { page: 1, page_size: 4, total: 4 },
    }
  }
  if (path.includes('/intelligence/')) {
    return { data_available: false, tenant_id: SESSION_TENANT }
  }
  if (path.endsWith('/ingest-status')) {
    return { status: 'unknown', sources: [] }
  }
  if (path.endsWith('/systems/sync-status')) {
    return { connectors: [], systems: [] }
  }
  return {}
}

function evidenceFixtureBody(path: string, search: URLSearchParams): unknown {
  if (/\/evidence\/batch\/[^/]+\/lineage-graph$/.test(path)) {
    const batchId = path.split('/').slice(-2, -1)[0] ?? EVIDENCE_BATCH
    const root = `${batchId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}batchroot`
      .padEnd(64, 'b')
      .slice(0, 64)
    return {
      evidence_pack_id: PACK_BATCH,
      tenant_id: SESSION_TENANT,
      intent_id: '',
      merkle_root: root,
      nodes: [
        {
          id: `${batchId}-settlement-source`,
          label: 'Original Settlement File',
          node_type: 'SOURCE',
          leaf_hash: `${root.slice(0, 48)}aaaaaaaaaaaaaaaa`,
          item_ref: batchId,
          schema_version: 'v1',
        },
        {
          id: `${batchId}-canonical-batch`,
          label: 'Canonical Batch',
          node_type: 'TRANSFORM',
          leaf_hash: `${root.slice(0, 48)}bbbbbbbbbbbbbbbb`,
          item_ref: batchId,
          schema_version: 'v1',
        },
        {
          id: `${batchId}-batch-summary`,
          label: 'Evidence Summary',
          node_type: 'SEAL',
          leaf_hash: `${root.slice(0, 48)}cccccccccccccccc`,
          item_ref: PACK_BATCH,
          schema_version: 'v1',
        },
        {
          id: 'merkle_root',
          label: 'Proof Root',
          node_type: 'SEAL',
          leaf_hash: root,
        },
      ],
      edges: [
        { from: `${batchId}-settlement-source`, to: `${batchId}-canonical-batch`, label: 'canonicalise batch' },
        { from: `${batchId}-canonical-batch`, to: `${batchId}-batch-summary`, label: 'summarise' },
        { from: `${batchId}-batch-summary`, to: 'merkle_root', label: 'seal' },
      ],
    }
  }
  if (/\/evidence\/packs\/[^/]+\/lineage-graph$/.test(path)) {
    const packId = path.split('/').slice(-2, -1)[0] ?? PACK_BATCH
    const root = `${packId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}root`.padEnd(64, 'a').slice(0, 64)
    return {
      evidence_pack_id: packId,
      tenant_id: SESSION_TENANT,
      intent_id: packId === PACK_BATCH ? '' : packId === PACK_INTENT_A ? INTENT_A : INTENT_B,
      merkle_root: root,
      nodes: [
        {
          id: `${packId}-source`,
          label: 'Original Payment File',
          node_type: 'SOURCE',
          leaf_hash: `${root.slice(0, 48)}1111111111111111`,
          item_ref: `src-${packId}`,
          schema_version: 'v1',
        },
        {
          id: `${packId}-transform`,
          label: 'Structured Payment Intent',
          node_type: 'TRANSFORM',
          leaf_hash: `${root.slice(0, 48)}2222222222222222`,
          item_ref: `intent-${packId}`,
          schema_version: 'v1',
        },
        {
          id: `${packId}-summary`,
          label: 'Evidence Summary',
          node_type: 'SEAL',
          leaf_hash: `${root.slice(0, 48)}3333333333333333`,
          item_ref: packId,
          schema_version: 'v1',
        },
        {
          id: 'merkle_root',
          label: 'Proof Root',
          node_type: 'SEAL',
          leaf_hash: root,
        },
      ],
      edges: [
        { from: `${packId}-source`, to: `${packId}-transform`, label: 'canonicalise' },
        { from: `${packId}-transform`, to: `${packId}-summary`, label: 'seal' },
        { from: `${packId}-summary`, to: 'merkle_root', label: 'root' },
      ],
    }
  }
  if (/\/evidence\/batch\/[^/]+\/intents$/.test(path)) {
    const batchId = path.split('/').slice(-2, -1)[0] ?? EVIDENCE_BATCH
    if (batchId === EVIDENCE_BATCH) {
      return {
        packs: [
          packSummary(PACK_INTENT_A, {
            intentId: INTENT_A,
            batchId: EVIDENCE_BATCH,
            mode: 'INTELLIGENCE_ATTACH',
            ref: 'ZORD_PAY_A',
            leafCount: 9,
            requiredLeafCount: 5,
          }),
          packSummary(PACK_INTENT_B, {
            intentId: INTENT_B,
            batchId: EVIDENCE_BATCH,
            mode: 'INTELLIGENCE_ATTACH',
            ref: 'ZORD_PAY_B',
            leafCount: 9,
            requiredLeafCount: 9,
          }),
        ],
        total: 2,
      }
    }
    return { packs: [], total: 0 }
  }
  if (/\/evidence\/packs\/[^/]+$/.test(path) && !path.endsWith('/verify') && !path.endsWith('/timeline')) {
    const packId = path.split('/').pop() ?? PACK_BATCH
    const intent =
      packId === PACK_INTENT_A ? INTENT_A : packId === PACK_INTENT_B ? INTENT_B : INTENT_A
    const mode =
      packId === PACK_BATCH ? 'BATCH_PROOF' : 'INTELLIGENCE_INTENT'
    return packFull(packId, intent, mode)
  }
  if (!path.endsWith('/evidence/packs')) return emptyProdBody(path)

  const intentId = search.get('intent_id')
  const batchId = search.get('batch_id')
  if (intentId === INTENT_A) {
    return {
      packs: [
        packSummary(PACK_INTENT_A, {
          intentId: INTENT_A,
          mode: 'INTELLIGENCE_INTENT',
          ref: 'PAY-A',
          leafCount: 9,
          requiredLeafCount: 5,
        }),
      ],
      total: 1,
    }
  }
  if (intentId === INTENT_B) {
    return {
      packs: [
        packSummary(PACK_INTENT_B, {
          intentId: INTENT_B,
          mode: 'INTELLIGENCE_INTENT',
          ref: 'PAY-B',
          leafCount: 9,
          requiredLeafCount: 9,
        }),
      ],
      total: 1,
    }
  }
  if (batchId === EVIDENCE_BATCH) {
    return {
      packs: [
        packSummary(PACK_BATCH, {
          mode: 'BATCH_PROOF',
          ref: 'BATCH-REF',
          batchId: EVIDENCE_BATCH,
          leafCount: 6,
          requiredLeafCount: 6,
        }),
      ],
      total: 1,
    }
  }
  return { packs: [], total: 0 }
}

function installAuthRoutes(page: Page) {
  return Promise.all([
    page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { tenant_id: SESSION_TENANT },
          user: { tenant_id: SESSION_TENANT },
        }),
      })
    }),
    page.route('**/api/sandbox/workspace-api-keys', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tenant_id: SESSION_TENANT }),
      })
    }),
  ])
}

function installEmptyProdMocks(page: Page) {
  return page.route('**/api/prod/**', async (route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    const path = url.pathname
    if (method === 'POST' && /\/evidence\/packs\/[^/]+\/verify$/.test(new URL(route.request().url()).pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'VERIFIED',
          evidence_pack_id: PACK_BATCH,
          checked_at: new Date().toISOString(),
          stored_root: 'a'.repeat(64),
          computed_root: 'a'.repeat(64),
          explanation: 'Merkle root reproduced exactly from live database entries.',
        }),
      })
      return
    }
    if (method !== 'GET') {
      await route.continue()
      return
    }
    if (/\/evidence\/packs\/[^/]+\/export$/.test(path)) {
      const packId = path.split('/').slice(-2, -1)[0] ?? PACK_BATCH
      const format = (url.searchParams.get('format') || 'json').toLowerCase()
      await route.fulfill({
        status: 200,
        contentType: format === 'pdf' ? 'application/pdf' : 'application/json',
        headers: {
          'content-disposition': `attachment; filename="evidence_pack_${packId}.${format === 'pdf' ? 'pdf' : 'json'}"`,
        },
        body:
          format === 'pdf'
            ? '%PDF-1.4\n%mock evidence export\n'
            : JSON.stringify({ evidence_pack_id: packId, export: 'mock' }),
      })
      return
    }
    let body: unknown = emptyProdBody(path)
    if (path.endsWith('/settlement/observations/batches') && url.searchParams.get('client_batch_id')) {
      const clientBatchId = url.searchParams.get('client_batch_id') ?? BATCH_ID
      body = {
        items: [
          {
            settlement_observation_id: 'obs-1',
            client_batch_id: clientBatchId,
            provider_reference: 'razorpay',
            source_system: 'razorpay',
            amount: 2500,
            settlement_status: 'SETTLED',
            source_row_ref: '1',
            client_reference_candidate: 'PAY-001',
            bank_reference: 'UTR123',
          },
        ],
        pagination: { page: 1, page_size: 20, total: 20 },
      }
    }
    if (/\/evidence\/packs\/[^/]+\/timeline$/.test(path)) {
      body = {
        evidence_pack_id: path.split('/').slice(-2, -1)[0],
        intent_id: INTENT_A,
        timeline: [
          { timestamp: '2026-05-01T12:00:00Z', event: 'Payment instruction received', node_id: 'n1' },
        ],
      }
    }
    if (/\/evidence\/packs\/[^/]+$/.test(path) && !path.endsWith('/verify') && !path.endsWith('/timeline')) {
      const packId = path.split('/').pop() ?? PACK_BATCH
      body = packFull(packId, INTENT_A, 'BATCH_PROOF')
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

function installEvidenceFixtureMocks(page: Page) {
  return page.route('**/api/prod/**', async (route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    const path = url.pathname

    if (method === 'POST' && /\/evidence\/packs\/[^/]+\/verify$/.test(path)) {
      const packId = path.split('/').slice(-2, -1)[0] ?? PACK_BATCH
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'VERIFIED',
          evidence_pack_id: packId,
          checked_at: new Date().toISOString(),
          stored_root: 'c'.repeat(64),
          computed_root: 'c'.repeat(64),
          explanation: 'Merkle root reproduced exactly from live database entries.',
        }),
      })
      return
    }

    if (method !== 'GET') {
      await route.continue()
      return
    }

    if (/\/evidence\/packs\/[^/]+\/export$/.test(path)) {
      const packId = path.split('/').slice(-2, -1)[0] ?? PACK_BATCH
      const format = (url.searchParams.get('format') || 'json').toLowerCase()
      await route.fulfill({
        status: 200,
        contentType: format === 'pdf' ? 'application/pdf' : 'application/json',
        headers: {
          'content-disposition': `attachment; filename="evidence_pack_${packId}.${format === 'pdf' ? 'pdf' : 'json'}"`,
        },
        body:
          format === 'pdf'
            ? '%PDF-1.4\n%mock evidence export\n'
            : JSON.stringify({ evidence_pack_id: packId, export: 'fixture' }),
      })
      return
    }

    if (path.endsWith('/intelligence/batches')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant_id: SESSION_TENANT,
          batches: [{ batch_id: EVIDENCE_BATCH, finality_status: 'OPEN', total_count: 2 }],
        }),
      })
      return
    }
    if (path.endsWith('/intents/payment-intents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { intent_id: INTENT_A, client_payout_ref: 'PAY-A', batch_id: EVIDENCE_BATCH },
            { intent_id: INTENT_B, client_payout_ref: 'PAY-B', batch_id: EVIDENCE_BATCH },
          ],
        }),
      })
      return
    }
    if (path.includes('/evidence/') || path.includes('/intelligence/')) {
      const body = path.includes('/evidence/')
        ? evidenceFixtureBody(path, url.searchParams)
        : { data_available: false, tenant_id: SESSION_TENANT }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyProdBody(path)),
    })
  })
}

async function preparePage(page: Page, context: BrowserContext, prodMock: (page: Page) => Promise<void>) {
  await installPayoutSessionCookies(context)
  await installAuthRoutes(page)
  await prodMock(page)
  await page.addInitScript((tid) => {
    localStorage.setItem('zord_tenant_id', tid)
  }, SESSION_TENANT)
  await page.goto(`${BASE_URL}/payout-command-view/today?dock=home`)
  await expect(page.getByRole('heading', { name: 'Payment Command Center', level: 1 }).first()).toBeVisible({
    timeout: 20_000,
  })
}

async function expectNoRuntimeOverlay(page: Page) {
  await expect(page.getByText('Application error')).toHaveCount(0)
  await expect(page.getByText('Unhandled Runtime Error')).toHaveCount(0)
}

test.describe('payout console pages smoke (empty prod → preview fallbacks)', () => {
  test.beforeEach(async ({ page, context }) => {
    await preparePage(page, context, installEmptyProdMocks)
  })

  for (const { dock, title } of DOCK_CASES) {
    test(`dock=${dock} renders ${title}`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))

      await page.goto(`/payout-command-view/today?dock=${dock}`)
      await expect(page.getByRole('heading', { name: title, level: 1 }).first()).toBeVisible({ timeout: 25_000 })
      await expectNoRuntimeOverlay(page)
      expect(pageErrors, `page errors on dock=${dock}`).toEqual([])
    })
  }

  test('navy KPI heroes render all expected bucket counts', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=grid')
    await expect(page.getByTestId('intent-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="intent-kpi-hero-bucket-"]')).toHaveCount(5)

    await page.goto('/payout-command-view/today?dock=settlement')
    await expect(page.getByTestId('settlement-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="settlement-kpi-hero-bucket-"]')).toHaveCount(4)

    await page.goto('/payout-command-view/today?dock=ambiguity')
    await expect(page.getByTestId('ambiguity-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="ambiguity-kpi-hero-bucket-"]')).toHaveCount(4)

    await page.goto('/payout-command-view/today?dock=proof')
    await expect(page.getByTestId('evidence-kpi-hero')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid^="evidence-kpi-hero-bucket-"]')).toHaveCount(5)
  })

  test('leakage keeps 2x2 KPI structure with dark hero styling', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=leakage')
    await expect(page.getByTestId('leakage-kpi-strip')).toBeVisible({ timeout: 20_000 })
    const hero = page.getByTestId('leakage-kpi-hero')
    await expect(hero).toBeVisible({ timeout: 20_000 })
    await expect(hero).toHaveAttribute('style', /0f172a/i)
    await expect(page.locator('[data-testid^="leakage-kpi-secondary-"]')).toHaveCount(4)
  })

  test('view batches navigates from ambiguity dock header', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=ambiguity')
    await expect(page.getByTestId('ambiguity-kpi-hero')).toBeVisible({ timeout: 20_000 })
    const viewBatches = page.getByTestId('view-batches-link')
    await expect(viewBatches).toHaveAttribute('href', /\/payout-command-view\/batch-command-center/)
    await viewBatches.click()
    await expect(page).toHaveURL(/\/payout-command-view\/batch-command-center/, { timeout: 15_000 })
  })

  test('view batches link works from settlement and intent journal docks', async ({ page }) => {
    for (const dock of ['settlement', 'grid'] as const) {
      await page.goto(`/payout-command-view/today?dock=${dock}`)
      await expect(page.getByTestId('view-batches-link')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('view-batches-link')).toHaveAttribute(
        'href',
        /\/payout-command-view\/batch-command-center/,
      )
      await page.getByTestId('view-batches-link').click()
      await expect(page).toHaveURL(/\/payout-command-view\/batch-command-center/, { timeout: 15_000 })
    }
  })

  test('leakage hides Preview when live comparison timeseries is available', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=leakage')
    await expect(page.getByText('Current leakage').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Preview', { exact: true })).toHaveCount(0)
  })

  test('ambiguity shows awaiting-live state when velocity scatter is empty', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=ambiguity')
    await expect(page.getByText('Ambiguity Velocity')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Awaiting live data', { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('Preview', { exact: true })).toHaveCount(0)
  })

  test('connectors renders API-driven routing sections', async ({ page }) => {
    test.setTimeout(45_000)
    const captures: ProdCapture[] = []
    page.on('request', (req) => {
      if (req.method() !== 'GET') return
      const cap = captureProdGet(req.url())
      if (cap) captures.push(cap)
    })

    await page.goto('/payout-command-view/today?dock=connectors')
    await expect(page.getByRole('heading', { name: 'Connector Performance & Leakage', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByTestId('routing-kpi-bar')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByTestId('network-health-chart')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('leakage-composition-chart')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('connector-grid')).toContainText('Cashfree', { timeout: 15_000 })
    await expect(page.getByTestId('connector-grid')).toContainText('Strengthen provider contract')
    await expect(page.getByTestId('recommended-routes')).toHaveCount(0)
    await expect(page.getByText('Razorpay')).toHaveCount(0)
    await expect(page.getByText('ICICI Bank')).toHaveCount(0)
    expect(captures.some((c) => c.pathname.endsWith('/api/prod/intelligence/leakage'))).toBe(true)
    expect(captures.some((c) => c.pathname.endsWith('/api/prod/intelligence/ambiguity/heatmap'))).toBe(true)
    expect(captures.some((c) => c.pathname.endsWith('/api/prod/intelligence/pattern'))).toBe(true)
    expect(captures.some((c) => c.pathname.endsWith('/api/prod/intelligence/pattern/history'))).toBe(true)
    expect(captures.some((c) => c.pathname.endsWith('/api/prod/intelligence/recommendations'))).toBe(true)
  })

  test('connectors shows empty state when intelligence APIs have no data', async ({ page }) => {
    await page.route('**/api/prod/intelligence/**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data_available: false, tenant_id: SESSION_TENANT }),
      })
    })

    await page.goto('/payout-command-view/today?dock=connectors')
    await expect(page.getByRole('heading', { name: 'Connector Performance & Leakage', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByTestId('routing-empty-state')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('routing-kpi-bar')).toHaveCount(0)
    await expect(page.getByTestId('connector-grid')).toHaveCount(0)
    await expect(page.getByText('Razorpay')).toHaveCount(0)
  })

  test('evidence shows empty pack state when no live packs', async ({ page }) => {
    await page.goto(`/payout-command-view/today?dock=proof&batch_id=${encodeURIComponent(BATCH_ID)}`)
    await expect(page.getByRole('heading', { name: 'Evidence & Dispute Resolution', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByText('Preview', { exact: true })).toHaveCount(0)
    await expect(
      page.getByText(/No evidence packs|pack not found|Select a batch|awaiting/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  for (const path of STANDALONE_ROUTES) {
    test(`standalone ${path.split('?')[0]} loads`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))
      await page.goto(path)
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await expectNoRuntimeOverlay(page)
      expect(pageErrors, `errors on ${path}`).toEqual([])
    })
  }

  test('batch command center shows Payment Batch Review heading', async ({ page }) => {
    await page.goto('/payout-command-view/batch-command-center')
    await expect(page.getByTestId('batch-review-page')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('heading', { name: 'Payment Batch Review', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByText('File processing status')).toHaveCount(0)
    await expect(page.getByText('Batch Progress')).toHaveCount(0)
    await expectNoRuntimeOverlay(page)
  })
})

test.describe('evidence batch → intent → pack wiring', () => {
  test.beforeEach(async ({ page, context }) => {
    await preparePage(page, context, installEvidenceFixtureMocks)
  })

  test('evidence proof dock shows batch-only browser row', async ({ page }) => {
    await page.goto(`${BASE_URL}/payout-command-view/today?dock=proof&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`)
    await expect(page.getByRole('heading', { name: 'Evidence & Dispute Resolution', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByRole('columnheader', { name: 'Evidence Pack' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('columnheader', { name: 'Scope' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Proof Root' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Score' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Leaves' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View batch proof' })).toHaveCount(1, { timeout: 15_000 })
    await expect(page.getByRole('columnheader', { name: 'Intent' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCount(0)
    await expect(page.getByText('1100%')).toHaveCount(0)
    await expect(page.getByText(/payment proofs/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('fan-out API calls and table on Evidence dock', async ({ page, context }) => {
    const captures: ProdCapture[] = []
    page.on('request', (req) => {
      if (req.method() !== 'GET') return
      const cap = captureProdGet(req.url())
      if (cap) captures.push(cap)
    })

    await page.goto(`${BASE_URL}/payout-command-view/today?dock=proof&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`)
    await expect(page.getByRole('heading', { name: 'Evidence & Dispute Resolution', level: 1 })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByRole('link', { name: 'View batch proof' }).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(PACK_BATCH).first()).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(PACK_INTENT_A)).toHaveCount(0)

    const packs = captures.filter((c) => c.pathname.endsWith('/evidence/packs'))
    expect(packs.some((c) => c.searchParams.get('batch_id') === EVIDENCE_BATCH)).toBe(true)
    const batchIntentsCalls = captures.filter((c) =>
      c.pathname.endsWith(`/evidence/batch/${encodeURIComponent(EVIDENCE_BATCH)}/intents`),
    )
    expect(batchIntentsCalls.length).toBeGreaterThan(0)

    await expect(page.getByText('Batch proof').first()).toBeVisible({ timeout: 10_000 })

    await installPayoutSessionCookies(context)
    await page.goto(`${BASE_URL}/payout-command-view/evidence-pack/${encodeURIComponent(PACK_BATCH)}?tab=graph&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`)
    await expect(page.getByRole('button', { name: /Batch graph/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Intent proofs/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Verify proof integrity')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('link', { name: 'Summary' })).toHaveCount(0)

    await page.getByRole('button', { name: /Intent proofs/i }).click()
    await expect(page.getByText('Payment proofs')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('link', { name: 'Summary' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Verify proof integrity')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('link', { name: 'Summary' }).click()
    await expect(page.getByText('Match confidence')).toBeVisible({ timeout: 20_000 })

    const lineageCalls = captures.filter((c) => /\/evidence\/packs\/[^/]+\/lineage-graph$/.test(c.pathname))
    expect(lineageCalls.length).toBeGreaterThan(0)
    const batchLineageCalls = captures.filter((c) =>
      c.pathname.endsWith(`/evidence/batch/${encodeURIComponent(EVIDENCE_BATCH)}/lineage-graph`),
    )
    expect(batchLineageCalls.length).toBeGreaterThan(0)

    await installPayoutSessionCookies(context)
    await page.goto(`${BASE_URL}/payout-command-view/evidence-pack/${encodeURIComponent(PACK_INTENT_A)}?tab=summary&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`)
    await expect(page.getByText('Match confidence')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('96.75%')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Governance decision')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Fail')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('To complete this proof:')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Confirm match decision')).toBeVisible({ timeout: 20_000 })
  })

  test('evidence graph export buttons request the wired export endpoints', async ({ page }) => {
    await installPayoutSessionCookies(page.context())
    await page.goto(
      `${BASE_URL}/payout-command-view/evidence-pack/${encodeURIComponent(PACK_BATCH)}?tab=graph&batch_id=${encodeURIComponent(EVIDENCE_BATCH)}`,
    )
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Export JSON/i })).toBeVisible({ timeout: 20_000 })

    const requests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/prod/evidence/batch/')) requests.push(req.url())
    })

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PDF' }).click(),
    ])
    expect(pdfDownload.suggestedFilename()).toBe('evidence_batch_e2e-evidence-batch_intents.pdf')
    await expect(page.getByRole('button', { name: /Export JSON/i })).toBeEnabled({ timeout: 20_000 })

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export JSON/i }).click(),
    ])
    expect(jsonDownload.suggestedFilename()).toBe('evidence_batch_e2e-evidence-batch_intents.json')
    expect(requests.some((url) => url.includes('/api/prod/evidence/batch/e2e-evidence-batch/intents'))).toBe(true)
  })
})
