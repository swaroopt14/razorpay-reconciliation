import { DEMO_SMOKE_BATCH_ID, demoBatchHref } from './ycDemoConstants'
import {
  DEMO_PAYOUT_AMOUNTS,
  demoIntendedPaymentValue,
  demoPayeeLabel,
  demoPayoutAmount,
  demoShortObserved,
} from './demoPayoutAmounts'
import { undersettleBreakdownForIndex, type UndersettleBreakdown } from './undersettleScheduleDemo'

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
  | 'Blocked'

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
  /** Present when policy sealed a tax + margin cut from the invoice. */
  undersettle: UndersettleBreakdown | null
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
    maximumFractionDigits: 2,
  }).format(n)
}

function pacIdForIndex(index: number): string {
  return `PAC-${String(index + 1).padStart(4, '0')}`
}

function payRefForIndex(index: number): string {
  return `PAY-${String(index + 1).padStart(4, '0')}`
}

const RAILS = ['NEFT', 'IMPS', 'UPI', 'NEFT', 'IMPS'] as const
const ACCOUNT_TAILS = [
  '4821', '1190', '7742', '3308', '5514', '9082', '2261', '6640', '1837', '4499',
  '7023', '3156', '8801', '2470', '5912', '1364', '9580', '4107', '6733', '0298',
] as const

function buildBatchContract(index: number): PaymentActionContract {
  const amount = demoPayoutAmount(index)
  const payee = demoPayeeLabel(index)
  const pacId = pacIdForIndex(index)
  const payRef = payRefForIndex(index)
  const amountLabel = formatInr(amount)
  const rail = RAILS[index % RAILS.length]!
  const accountTail = ACCOUNT_TAILS[index] ?? '0000'
  const invoice = `INV-${4400 + index + 1}`
  const po = `PO-${9900 + index + 1}`
  const blocked = index === 19
  const shortSettled = index === 18
  const undersettle = undersettleBreakdownForIndex(index)
  const sealedNetLabel = undersettle?.expectedNetLabel ?? amountLabel

  const lifecycle: ContractLifecycle = blocked
    ? 'Blocked'
    : shortSettled
      ? 'Outcome observed'
      : index < 12
        ? 'Proof ready'
        : 'Ready to dispatch'

  const sealed = !blocked
  const policyPassed = !blocked

  return {
    id: pacId,
    version: 'v1',
    humanRef: payRef,
    batchId: DEMO_SMOKE_BATCH_ID,
    instructionRef: `INT-${String(index + 1).padStart(4, '0')}`,
    lifecycle,
    sealed,
    policyPassed,
    signatureVerified: sealed,
    expiryLabel: blocked
      ? 'Seal blocked · beneficiary change under review'
      : 'Seal window · 12 Jun 2026 23:59 IST',
    operatingMode: 'Prepare & Sign',
    plainSummary: blocked
      ? `${payRef}: payout to ${payee} ${amountLabel} is blocked — beneficiary details changed after source approval. No seal until Control Review clears the change.`
      : shortSettled
        ? `${payRef}: sealed contract expected ${amountLabel} to ${payee}; settlement observed ${formatInr(demoShortObserved(index))} (short). Outcome Review holds the unexplained delta.`
        : undersettle
          ? `${payRef}: pay ${payee} sealed net ${undersettle.expectedNetLabel} (invoice ${undersettle.invoiceLabel} − tax ${undersettle.taxLabel} − margin ${undersettle.marginLabel}) for invoice ${invoice}. Authorised cuts are not a settlement exception.`
          : `This payout only: pay ${payee} ${amountLabel} INR for invoice ${invoice} from Acme Payments India - ${rail} on HDFC corporate rail, dual-control approved, policy Enterprise default v3 passed. Batch intended value across all ${DEMO_PAYOUT_AMOUNTS.length} payouts is ${formatInr(demoIntendedPaymentValue())}.`,
    obligation: {
      businessReason: `Vendor settlement - ${payRef} materials ${po}`,
      sourceRef: `SAP · AP voucher AP-${778200 + index + 1}`,
      invoiceOrContract: `${invoice} · ${po}`,
      payerEntity: 'Acme Payments India Pvt Ltd',
    },
    authority: {
      initiator: 'maker@acme.example',
      approvers: blocked ? [] : ['checker@acme.example'],
      approvalTime: blocked ? 'Pending dual-control' : '12 Jun 2026 · 09:41 IST',
      policyVersion: 'Enterprise default · v3 (active)',
      policyDecisionId: `PD-${String(index + 1).padStart(4, '0')}`,
    },
    beneficiary: {
      legalName: payee,
      maskedAccount: `HDFC · •••• ${accountTail}`,
      beneficiaryVersion: blocked ? 'ben-v4 (changed)' : 'ben-v3 (validated)',
      validationState: blocked
        ? 'Material beneficiary change vs authorised source'
        : 'Matched authorised source · no material change',
    },
    terms: {
      amountLabel,
      currency: 'INR',
      discountsLabel: '₹0',
      feesLabel: 'Borne by payer (rail fee outside contract net)',
      taxesLabel: undersettle
        ? `${undersettle.taxLabel} · ${undersettle.taxRateLabel} withheld from invoice`
        : `Included in invoice · GST as per ${invoice}`,
      deductionsLabel: undersettle
        ? `${undersettle.marginLabel} · ${undersettle.marginRateLabel}`
        : '₹0',
      netAmountLabel: sealedNetLabel,
    },
    undersettle,
    execution: {
      allowedRail: `${rail} (domestic INR)`,
      provider: 'HDFC Bank · corporate payout',
      schedule: 'Same-day · after seal',
      sla: 'Credit expected T+0 banking hours',
      retryRules: 'Max 2 automatic retries · same idempotency key',
      idempotencyKey: `idem_${String(index + 1).padStart(4, '0')}_${rail.toLowerCase()}_v1`,
      fallbackConstraints: 'No alternate beneficiary · no rail switch without amendment',
    },
    outcomeRequirements: {
      expectedCreditedLabel: sealedNetLabel,
      tolerance: shortSettled
        ? '± ₹0 (exact match required) · short credit observed'
        : undersettle
          ? '± ₹0 versus sealed net (authorised tax and margin already applied)'
          : '± ₹0 (exact match required)',
      settlementDeadline: '12 Jun 2026 · EOD IST',
      requiredSignals: ['Bank UTR / payment ref', 'Credited amount', 'Value date'],
    },
    crossBorder: null,
    integrity: {
      canonicalisationVersion: 'zord-canon-2026.06',
      contractHash: sealed
        ? `sha256:pac${String(index + 1).padStart(4, '0')}7c3e9a1f0b2d4e6a8c0f1d3b5a7e9c2f`
        : '—',
      signature: sealed ? 'ed25519:MEUCIQDx…demo…sig' : '—',
      keyId: 'zord-tenant-acme-seal-key-01',
      sealedAt: sealed ? '12 Jun 2026 · 09:44:18 IST' : 'Not sealed',
    },
    policyDecision: {
      decision: blocked ? 'Block' : 'Pass',
      summary: blocked
        ? 'Blocked: beneficiary change freeze. Authorised account does not match current instruction.'
        : undersettle
          ? `Pass with policy-adjusted net. Company ${undersettle.companyCode} is on the undersettle schedule — tax and margin cut from the invoice; expected credit is ${undersettle.expectedNetLabel}.`
          : 'All required controls passed: source allow-listed, beneficiary frozen match, dual-control complete, amount within pack limits, no duplicate external ref.',
      rulesApplied: blocked
        ? [
            { id: 'rule-ben-freeze', name: 'Beneficiary change freeze', effect: 'block' },
            { id: 'rule-source-allowlist', name: 'Approved source systems', effect: 'allow' },
          ]
        : undersettle
          ? [
              { id: 'rule-source-allowlist', name: 'Approved source systems', effect: 'allow' },
              { id: 'rule-ben-freeze', name: 'Beneficiary change freeze', effect: 'allow' },
              {
                id: 'r-zord-undersettle-set',
                name: `Undersettle incomplete orders (Company ${undersettle.companyCode})`,
                effect: 'allow',
              },
              {
                id: 'r-zord-undersettle-tax',
                name: `Withhold tax line (${undersettle.taxRateLabel})`,
                effect: 'allow',
              },
              {
                id: 'r-zord-undersettle-margin',
                name: `Cut commercial margin (${undersettle.marginRateLabel})`,
                effect: 'allow',
              },
            ]
        : [
            { id: 'rule-source-allowlist', name: 'Approved source systems', effect: 'allow' },
            { id: 'rule-ben-freeze', name: 'Beneficiary change freeze', effect: 'allow' },
            {
              id: 'rule-dual-control',
              name: 'Dual-control above ₹50,000',
              effect: 'n/a (< threshold)',
            },
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
        detail: blocked ? 'Enterprise default v3 · Block' : 'Enterprise default v3 · Pass',
        kind: 'policy',
      },
      ...(blocked
        ? [
            {
              at: '12 Jun 2026 · 09:40 IST',
              title: 'Sent to Control Review',
              detail: 'Beneficiary change requires maker-checker clearance',
              kind: 'policy' as const,
            },
          ]
        : [
            {
              at: '12 Jun 2026 · 09:41 IST',
              title: 'Checker approved',
              detail: 'Authority grant recorded',
              kind: 'policy' as const,
            },
            {
              at: '12 Jun 2026 · 09:44 IST',
              title: 'Contract sealed',
              detail: 'v1 immutable · hash + signature written',
              kind: 'seal' as const,
            },
          ]),
      ...(shortSettled
        ? [
            {
              at: '12 Jun 2026 · 16:20 IST',
              title: 'Settlement observed',
              detail: `Credited ${formatInr(demoShortObserved(index))} vs sealed ${amountLabel}`,
              kind: 'outcome' as const,
            },
          ]
        : []),
    ],
    versions: [
      {
        id: `${pacId}-v1`,
        version: 'v1',
        status: sealed ? 'sealed' : 'draft',
        sealedAt: sealed ? '12 Jun 2026 · 09:44 IST' : null,
        note: blocked ? 'Draft held — beneficiary change' : 'Initial seal after policy pass',
        actor: blocked ? 'maker@acme.example' : 'checker@acme.example',
      },
    ],
    jsonBody: {
      object: 'payment_action_contract',
      id: pacId,
      version: 'v1',
      status: sealed ? 'sealed' : 'draft',
      human_ref: payRef,
      batch_id: DEMO_SMOKE_BATCH_ID,
      amount: { currency: 'INR', value: amount },
      expected_net: undersettle
        ? {
            invoice: undersettle.invoice,
            tax: undersettle.tax,
            margin: undersettle.margin,
            net: undersettle.expectedNet,
            policy_id: undersettle.policyId,
            reason: undersettle.reason,
          }
        : { invoice: amount, tax: 0, margin: 0, net: amount },
      beneficiary: { legal_name: payee, account_mask: `****${accountTail}` },
      policy_decision_id: `PD-${String(index + 1).padStart(4, '0')}`,
      integrity: sealed
        ? {
            hash: `sha256:pac${String(index + 1).padStart(4, '0')}7c3e9a1f0b2d4e6a8c0f1d3b5a7e9c2f`,
            key_id: 'zord-tenant-acme-seal-key-01',
            sealed_at: '2026-06-12T04:14:18Z',
          }
        : null,
    },
    links: {
      sourceHref: '/payouts/new',
      policyHref: '/controls/policies',
      intentHref: demoBatchHref('grid'),
      reviewHref: '/controls/review?demo=sandbox',
    },
  }
}

/** All 100 Batch 001 Payment Action Contracts (INR · ₹1,23,77,867.56). */
export const DEMO_ACTION_CONTRACTS: PaymentActionContract[] = DEMO_PAYOUT_AMOUNTS.map((_, i) =>
  buildBatchContract(i),
)

/** Hero demo contract - clean sealed payroll vendor payout (PAY-0001). */
export const DEMO_ACTION_CONTRACT: PaymentActionContract = DEMO_ACTION_CONTRACTS[0]!

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
    'Cross-border draft to Meridian GmbH - EUR settlement against an external bank quote on SWIFT. Quote TTL elapsed; seal and dispatch are blocked until a fresh quote is attached. Zord does not provide FX.',
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
  undersettle: null,
  execution: {
    allowedRail: 'SWIFT (cross-border EUR) · UPI (Cross-Border) not applicable for this corridor',
    provider: 'Correspondent bank · SWIFT',
    schedule: 'After fresh quote + seal',
    sla: 'Credit expected T+1 / T+2 value date',
    retryRules: 'Max 2 automatic retries · same idempotency key',
    idempotencyKey: 'idem_fx_03_swift_v0',
    fallbackConstraints: 'No domestic NEFT/RTGS/IMPS · no rail switch without amendment',
  },
  crossBorder: {
    quoteProvider: 'HDFC Bank FX desk (external)',
    quoteId: 'Q-8891',
    rate: '1 EUR = 89.42 INR',
    maximumSpread: '8 bps',
    feeCap: 'INR 2,500',
    settlementCurrency: 'EUR',
    quoteExpiry: 'Expired 11 Jun 2026 18:00 IST',
    honestNote: 'Zord seals external FX quotes into the contract. Zord is not an FX provider.',
  },
  outcomeRequirements: {
    expectedCreditedLabel: '€12,400',
    tolerance: 'Within quote spread',
    settlementDeadline: 'After fresh quote + seal',
    requiredSignals: ['FX fill confirmation', 'Credited EUR amount', 'Value date'],
  },
  integrity: {
    ...DEMO_ACTION_CONTRACT.integrity,
    contractHash: '—',
    signature: '—',
    sealedAt: 'Not sealed',
  },
  policyDecision: {
    decision: 'Require approval',
    summary: 'Quote expired — attach a fresh bank quote before seal.',
    rulesApplied: [
      { id: 'rule-fx-quote-ttl', name: 'FX quote freshness', effect: 'require_approval' },
    ],
  },
  timeline: [
    {
      at: '11 Jun 2026 · 10:00 IST',
      title: 'Obligation created',
      detail: 'Cross-border AP voucher',
      kind: 'source',
    },
    {
      at: '11 Jun 2026 · 18:01 IST',
      title: 'Quote expired',
      detail: 'Q-8891 past TTL — seal blocked',
      kind: 'policy',
    },
  ],
  versions: [
    {
      id: 'PAC-FX-03-v0',
      version: 'v0',
      status: 'draft',
      sealedAt: null,
      note: 'Draft awaiting fresh FX quote',
      actor: 'maker@acme.example',
    },
  ],
  jsonBody: {
    object: 'payment_action_contract',
    id: DEMO_ACTION_CONTRACT_FX_ID,
    version: 'v0',
    status: 'draft',
    human_ref: 'PAY-FX-03',
    batch_id: DEMO_SMOKE_BATCH_ID,
    cross_border: {
      quote_id: 'Q-8891',
      quote_expired: true,
    },
  },
}

const REGISTRY: Record<string, PaymentActionContract> = (() => {
  const map: Record<string, PaymentActionContract> = {}
  for (const pac of DEMO_ACTION_CONTRACTS) {
    map[pac.id] = pac
    map[pac.id.toLowerCase()] = pac
  }
  map['PAC-DEMO-0001'] = DEMO_ACTION_CONTRACT
  map['PAC-YC-0001'] = DEMO_ACTION_CONTRACT
  map['pac-yc-0001'] = DEMO_ACTION_CONTRACT
  map[DEMO_ACTION_CONTRACT_FX_ID] = DEMO_ACTION_CONTRACT_FX
  map['pac-fx-03'] = DEMO_ACTION_CONTRACT_FX
  map['PAC-DEMO-FX-03'] = DEMO_ACTION_CONTRACT_FX
  map['PAC-YC-FX-03'] = DEMO_ACTION_CONTRACT_FX
  map['pac-yc-fx-03'] = DEMO_ACTION_CONTRACT_FX
  return map
})()

export function listActionContracts(): PaymentActionContract[] {
  return DEMO_ACTION_CONTRACTS
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
