import { DEMO_SMOKE_BATCH_ID, demoBatchHref } from './ycDemoConstants'
import { DEMO_PAYOUT_AMOUNTS } from './demoPayoutAmounts'

/** Spec 7.8 - Payment Action Contract demo fixtures (highest polish investment). */

export const ACTION_CONTRACT_HEADER = {
  title: 'Payment Action Contract',
  subtitle: 'The signed, policy-bound instruction carried across the payout lifecycle.',
  conceptNote:
    'Programmable verifiable intent - customer-visible object: Payment Action Contract.',
} as const

export const DEMO_ACTION_CONTRACT_ID = 'PAC-0001'
export const DEMO_ACTION_CONTRACT_FX_ID = 'PAC-FX-03'

export type ContractLifecycle =
  | 'Draft'
  | 'Sealed'
  | 'Ready to dispatch'
  | 'Dispatched'
  | 'Outcome observed'
  | 'Proof ready'

export type OperatingMode =
  | 'File Proof'
  | 'Connected Observe'
  | 'Prepare & Sign'
  | 'Dispatch Control'

export type ContractVersionStatus = 'sealed' | 'draft' | 'superseded'

export type TimelineEvent = {
  at: string
  title: string
  detail: string
  kind: 'source' | 'policy' | 'seal' | 'dispatch' | 'outcome' | 'amendment'
}

export type ContractVersion = {
  id: string
  version: string
  status: ContractVersionStatus
  sealedAt: string | null
  note: string
  actor: string
}

export type PaymentActionContract = {
  id: string
  version: string
  humanRef: string
  batchId: string
  instructionRef: string
  lifecycle: ContractLifecycle
  sealed: boolean
  policyPassed: boolean
  signatureVerified: boolean
  expiryLabel: string
  operatingMode: OperatingMode
  /** One-line business summary - readable without JSON. */
  plainSummary: string
  obligation: {
    businessReason: string
    sourceRef: string
    invoiceOrContract: string
    payerEntity: string
  }
  authority: {
    initiator: string
    approvers: string[]
    approvalTime: string
    policyVersion: string
    policyDecisionId: string
  }
  beneficiary: {
    legalName: string
    maskedAccount: string
    beneficiaryVersion: string
    validationState: string
  }
  terms: {
    amountLabel: string
    currency: string
    discountsLabel: string
    feesLabel: string
    taxesLabel: string
    deductionsLabel: string
    netAmountLabel: string
  }
  execution: {
    allowedRail: string
    provider: string
    schedule: string
    sla: string
    retryRules: string
    idempotencyKey: string
    fallbackConstraints: string
  }
  outcomeRequirements: {
    expectedCreditedLabel: string
    tolerance: string
    settlementDeadline: string
    requiredSignals: string[]
  }
  crossBorder: null | {
    quoteProvider: string
    quoteId: string
    rate: string
    maximumSpread: string
    feeCap: string
    settlementCurrency: string
    quoteExpiry: string
    honestNote: string
  }
  integrity: {
    canonicalisationVersion: string
    contractHash: string
    signature: string
    keyId: string
    sealedAt: string
  }
  policyDecision: {
    decision: 'Pass' | 'Block' | 'Require approval'
    summary: string
    rulesApplied: { id: string; name: string; effect: string }[]
  }
  timeline: TimelineEvent[]
  versions: ContractVersion[]
  jsonBody: Record<string, unknown>
  links: {
    sourceHref: string
    policyHref: string
    intentHref: string
    reviewHref: string
  }
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

const CLEAN_AMOUNT = DEMO_PAYOUT_AMOUNTS[0]! // ₹5,500 — batch total ₹55,000 (not lakhs)

/** Hero demo contract - clean sealed payroll vendor payout. */
export const DEMO_ACTION_CONTRACT: PaymentActionContract = {
  id: DEMO_ACTION_CONTRACT_ID,
  version: 'v1',
  humanRef: 'PAY-0001',
  batchId: DEMO_SMOKE_BATCH_ID,
  instructionRef: 'INT-0001',
  lifecycle: 'Ready to dispatch',
  sealed: true,
  policyPassed: true,
  signatureVerified: true,
  expiryLabel: 'Seal window · 12 Jun 2026 23:59 IST',
  operatingMode: 'Prepare & Sign',
  plainSummary:
    'This payout only: pay Apex Components Pvt Ltd ₹5,500 INR for invoice INV-4412 from Acme Payments India - NEFT on HDFC corporate rail, dual-control approved, policy Enterprise default v3 passed. Batch intended value across all 20 payouts is ₹55,000 (Overview / Intent Journal).',
  obligation: {
    businessReason: 'Vendor settlement - June materials PO-9921',
    sourceRef: 'SAP · AP voucher AP-778201',
    invoiceOrContract: 'INV-4412 · PO-9921',
    payerEntity: 'Acme Payments India Pvt Ltd',
  },
  authority: {
    initiator: 'maker@acme.example',
    approvers: ['checker@acme.example'],
    approvalTime: '12 Jun 2026 · 09:41 IST',
    policyVersion: 'Enterprise default · v3 (active)',
    policyDecisionId: 'PD-0001',
  },
  beneficiary: {
    legalName: 'Apex Components Pvt Ltd',
    maskedAccount: 'HDFC · •••• 4821',
    beneficiaryVersion: 'ben-v3 (validated)',
    validationState: 'Matched authorised source · no material change',
  },
  terms: {
    amountLabel: '₹5,500',
    currency: 'INR',
    discountsLabel: '₹0',
    feesLabel: 'Borne by payer (rail fee outside contract net)',
    taxesLabel: 'Included in invoice · GST as per INV-4412',
    deductionsLabel: '₹0',
    netAmountLabel: '₹5,500',
  },
  execution: {
    allowedRail: 'NEFT (domestic INR)',
    provider: 'HDFC Bank · corporate payout',
    schedule: 'Same-day · after seal',
    sla: 'Credit expected T+0 banking hours',
    retryRules: 'Max 2 automatic retries · same idempotency key',
    idempotencyKey: 'idem_0001_neft_v1',
    fallbackConstraints: 'No alternate beneficiary · no rail switch without amendment',
  },
  outcomeRequirements: {
    expectedCreditedLabel: '₹5,500',
    tolerance: '± ₹0 (exact match required)',
    settlementDeadline: '12 Jun 2026 · EOD IST',
    requiredSignals: ['Bank UTR / payment ref', 'Credited amount', 'Value date'],
  },
  crossBorder: null,
  integrity: {
    canonicalisationVersion: 'zord-canon-2026.06',
    contractHash: 'sha256:7c3e9a1f0b2d4e6a8c0f1d3b5a7e9c2f4d6b8a0e1c3f5d7b9a1e3c5f7d9b2a4',
    signature: 'ed25519:MEUCIQDx…demo…sig',
    keyId: 'zord-tenant-acme-seal-key-01',
    sealedAt: '12 Jun 2026 · 09:44:18 IST',
  },
  policyDecision: {
    decision: 'Pass',
    summary:
      'All required controls passed: source allow-listed, beneficiary frozen match, dual-control complete, amount within pack limits, no duplicate external ref.',
    rulesApplied: [
      { id: 'rule-source-allowlist', name: 'Approved source systems', effect: 'allow' },
      { id: 'rule-ben-freeze', name: 'Beneficiary change freeze', effect: 'allow' },
      { id: 'rule-dual-control', name: 'Dual-control above ₹50,000', effect: 'n/a (< threshold)' },
      { id: 'rule-idempotency', name: 'Duplicate / replay guard', effect: 'allow' },
    ],
  },
  timeline: [
    {
      at: '12 Jun 2026 · 09:12 IST',
      title: 'Obligation created',
      detail: 'SAP AP voucher ingested into batch',
      kind: 'source',
    },
    {
      at: '12 Jun 2026 · 09:28 IST',
      title: 'Policy evaluated',
      detail: 'Enterprise default v3 · Pass',
      kind: 'policy',
    },
    {
      at: '12 Jun 2026 · 09:41 IST',
      title: 'Checker approved',
      detail: 'Authority grant recorded',
      kind: 'policy',
    },
    {
      at: '12 Jun 2026 · 09:44 IST',
      title: 'Contract sealed',
      detail: 'v1 immutable · hash + signature written',
      kind: 'seal',
    },
  ],
  versions: [
    {
      id: 'PAC-0001-v1',
      version: 'v1',
      status: 'sealed',
      sealedAt: '12 Jun 2026 · 09:44 IST',
      note: 'Initial seal after policy pass',
      actor: 'checker@acme.example',
    },
  ],
  jsonBody: {
    object: 'payment_action_contract',
    id: DEMO_ACTION_CONTRACT_ID,
    version: 'v1',
    status: 'sealed',
    human_ref: 'PAY-0001',
    batch_id: DEMO_SMOKE_BATCH_ID,
    amount: { currency: 'INR', value: CLEAN_AMOUNT },
    beneficiary: { legal_name: 'Apex Components Pvt Ltd', account_mask: '****4821' },
    policy_decision_id: 'PD-0001',
    integrity: {
      hash: 'sha256:7c3e9a1f0b2d4e6a8c0f1d3b5a7e9c2f4d6b8a0e1c3f5d7b9a1e3c5f7d9b2a4',
      key_id: 'zord-tenant-acme-seal-key-01',
      sealed_at: '2026-06-12T04:14:18Z',
    },
  },
  links: {
    sourceHref: '/payouts/new',
    policyHref: '/controls/policies',
    intentHref: demoBatchHref('grid'),
    reviewHref: '/controls/review?demo=sandbox',
  },
}

/** Optional FX contract - honest: Zord is not the FX provider. */
export const DEMO_ACTION_CONTRACT_FX: PaymentActionContract = {
  ...DEMO_ACTION_CONTRACT,
  id: DEMO_ACTION_CONTRACT_FX_ID,
  version: 'v1',
  humanRef: 'PAY-FX-03',
  instructionRef: 'INT-FX-03',
  lifecycle: 'Draft',
  sealed: false,
  policyPassed: false,
  signatureVerified: false,
  expiryLabel: 'Quote expired · re-attach required before seal',
  operatingMode: 'Prepare & Sign',
  plainSummary:
    'Cross-border draft to Meridian GmbH - EUR settlement against an external bank quote. Quote TTL elapsed; seal and dispatch are blocked until a fresh quote is attached. Zord does not provide FX.',
  obligation: {
    businessReason: 'EU supplier settlement - Q2 services',
    sourceRef: 'SAP · AP voucher AP-990114',
    invoiceOrContract: 'INV-EU-2201',
    payerEntity: 'Acme Payments India Pvt Ltd',
  },
  terms: {
    amountLabel: '€12,400',
    currency: 'EUR',
    discountsLabel: '€0',
    feesLabel: 'Per quote fee cap',
    taxesLabel: 'As invoiced',
    deductionsLabel: '€0',
    netAmountLabel: '€12,400',
  },
  crossBorder: {
    quoteProvider: 'HDFC Bank FX desk (external)',
    quoteId: 'Q-8891',
    rate: '1 EUR = 89.42 INR',
    maximumSpread: '8 bps',
    feeCap: '₹4,500',
    settlementCurrency: 'EUR',
    quoteExpiry: '12 Jun 2026 · 10:30 IST (expired)',
    honestNote:
      'Zord seals external quote + constraints into the Contract and verifies settlement against them. Zord is not an FX provider, bank, or stablecoin issuer.',
  },
  outcomeRequirements: {
    expectedCreditedLabel: '€12,400',
    tolerance: 'Within sealed quote spread',
    settlementDeadline: 'After fresh quote + seal',
    requiredSignals: ['FX fill confirmation', 'Credited EUR amount', 'Value date'],
  },
  integrity: {
    ...DEMO_ACTION_CONTRACT.integrity,
    contractHash: '- (not sealed)',
    signature: '-',
    sealedAt: '-',
  },
  policyDecision: {
    decision: 'Block',
    summary: 'FX quote TTL elapsed. Attach a live quote and re-run policy before seal.',
    rulesApplied: [
      { id: 'rule-quote-ttl', name: 'FX quote TTL', effect: 'block' },
    ],
  },
  timeline: [
    {
      at: '12 Jun 2026 · 09:55 IST',
      title: 'Draft + quote attached',
      detail: 'Q-8891 from bank portal',
      kind: 'source',
    },
    {
      at: '12 Jun 2026 · 10:31 IST',
      title: 'Quote expired',
      detail: 'Policy blocked seal',
      kind: 'policy',
    },
  ],
  versions: [
    {
      id: 'PAC-FX-03-draft',
      version: 'draft',
      status: 'draft',
      sealedAt: null,
      note: 'Awaiting fresh quote - not immutable yet',
      actor: 'fx.desk@acme.example',
    },
  ],
  jsonBody: {
    object: 'payment_action_contract',
    id: DEMO_ACTION_CONTRACT_FX_ID,
    version: 'draft',
    status: 'draft',
    cross_border: {
      quote_id: 'Q-8891',
      quote_expired: true,
    },
  },
}

const REGISTRY: Record<string, PaymentActionContract> = {
  [DEMO_ACTION_CONTRACT_ID]: DEMO_ACTION_CONTRACT,
  [DEMO_ACTION_CONTRACT.id.toLowerCase()]: DEMO_ACTION_CONTRACT,
  'pac-0001': DEMO_ACTION_CONTRACT,
  // Legacy aliases (old bookmarks)
  'PAC-DEMO-0001': DEMO_ACTION_CONTRACT,
  'PAC-YC-0001': DEMO_ACTION_CONTRACT, // legacy alias
  'pac-yc-0001': DEMO_ACTION_CONTRACT,
  [DEMO_ACTION_CONTRACT_FX_ID]: DEMO_ACTION_CONTRACT_FX,
  'pac-fx-03': DEMO_ACTION_CONTRACT_FX,
  'PAC-DEMO-FX-03': DEMO_ACTION_CONTRACT_FX,
  'PAC-YC-FX-03': DEMO_ACTION_CONTRACT_FX, // legacy alias
  'pac-yc-fx-03': DEMO_ACTION_CONTRACT_FX,
}

export function getActionContractById(id: string): PaymentActionContract | null {
  const key = id.trim()
  if (!key) return null
  return REGISTRY[key] ?? REGISTRY[key.toLowerCase()] ?? null
}

export function primaryContractCtas(contract: PaymentActionContract): {
  primary: { id: string; label: string; enabled: boolean; reason?: string }[]
  secondary: { id: string; label: string }[]
} {
  const canDispatch =
    contract.sealed &&
    contract.policyPassed &&
    contract.signatureVerified &&
    (contract.operatingMode === 'Dispatch Control' || contract.operatingMode === 'Prepare & Sign')

  return {
    primary: [
      {
        id: 'dispatch',
        label: 'Dispatch now',
        enabled: canDispatch && contract.lifecycle === 'Ready to dispatch',
        reason: !contract.sealed
          ? 'Seal required before dispatch'
          : contract.lifecycle !== 'Ready to dispatch'
            ? 'Not in ready-to-dispatch stage'
            : contract.operatingMode === 'Connected Observe' || contract.operatingMode === 'File Proof'
              ? `Mode is ${contract.operatingMode} - use Export signed instruction`
              : undefined,
      },
      {
        id: 'export',
        label: 'Export signed instruction',
        enabled: contract.sealed,
        reason: contract.sealed ? undefined : 'Available after seal',
      },
      {
        id: 'amend',
        label: 'Create amendment',
        enabled: true,
        reason: 'Material change creates a new draft version and fresh policy decision',
      },
    ],
    secondary: [
      { id: 'compare', label: 'Compare with source' },
      { id: 'policy', label: 'Open policy decision' },
      { id: 'download_json', label: 'Download JSON' },
      { id: 'copy_hash', label: 'Copy contract hash' },
    ],
  }
}
