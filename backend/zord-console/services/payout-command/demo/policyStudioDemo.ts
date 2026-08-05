import { DEMO_SMOKE_BATCH_ID, demoBatchHref } from './ycDemoConstants'

/** Spec 7.5 - Policy Studio demo registry (Service 7). */

export type PolicyEffect = 'allow' | 'warn' | 'block' | 'require_approval'

export type PolicyRuleCategory =
  | 'source_authority'
  | 'beneficiary'
  | 'commercial'
  | 'timing'
  | 'route'
  | 'replay'
  | 'evidence'

export type PolicyVersionStatus = 'draft' | 'active' | 'retired'

export type PolicyRule = {
  id: string
  category: PolicyRuleCategory
  whenField: string
  operator: string
  value: string
  effect: PolicyEffect
  /** Human-readable When…then… line */
  pattern: string
  /** Business-facing title for the control */
  businessLabel?: string
}

export type PolicyDraftBrief = {
  draftedByAgent: true
  payoutKind: string
  purpose: string
  /** Free-text note the user entered while creating the draft (Ask Zord step 3). */
  businessNote?: string
  approverRole: string
  activatorRole: string
  controlLabels: string[]
  amountThresholdLakh?: string
  impactNote: string
}

/** Prefer dedicated field; fall back to parsing older session-stored purpose strings. */
export function policyBusinessNote(brief?: PolicyDraftBrief | null): string | undefined {
  if (!brief) return undefined
  const direct = brief.businessNote?.trim()
  if (direct) return direct
  const match = brief.purpose.match(
    /Business note:\s*(.+?)(?:\.\s*Exceptions:|\s+Exceptions:|$)/i,
  )
  const parsed = match?.[1]?.trim().replace(/[.]+$/, '').trim()
  return parsed || undefined
}

export type PolicyVersion = {
  id: string
  packId: string
  version: string
  status: PolicyVersionStatus
  immutable: boolean
  createdAt: string
  activatedAt?: string
  retiredAt?: string
  actor: string
  signature: string
  rules: PolicyRule[]
  evidenceRequirement: {
    proofLevel: string
    mandatoryArtifacts: string[]
  }
  conflicts: { ruleA: string; ruleB: string; detail: string }[]
  /** Present when Zord prepared this draft from Ask Zord */
  draftBrief?: PolicyDraftBrief
}

export type PolicyPack = {
  id: string
  label: string
  summary: string
  usedByDemoBatch: boolean
  versions: PolicyVersion[]
}

export type PolicyTestResult = {
  batchId: string
  packLabel: string
  versionId: string
  versionLabel: string
  testedAt: string
  liveDataAffected: false
  totals: {
    allow: number
    warn: number
    block: number
    requireApproval: number
  }
  sampleImpacts: {
    obligationId: string
    effect: PolicyEffect
    ruleId: string
    rulePattern: string
  }[]
}

export type AiRuleSuggestion = {
  id: string
  label: string
  /** Short business title */
  pattern: string
  /** What would change if accepted */
  impact: string
  /** Why Zord is raising this (cite, not a decision) */
  why?: string
  accepted: boolean
}

export type PolicyFollowInsight = {
  batchId: string
  batchLabel: string
  mode: 'not_attached' | 'attached_draft' | 'attached_active'
  headline: string
  summary: string
  followedCleanly: number
  needsReview: number
  blocked: number
  citations: { label: string; detail: string }[]
  disclaimer: string
}

export const POLICY_STUDIO_HEADER = {
  title: 'Policy Studio',
  subtitle: 'Define the rules a payout must satisfy before release.',
} as const

export const POLICY_RULE_CATEGORIES: { id: PolicyRuleCategory; label: string }[] = [
  { id: 'source_authority', label: 'Source / authority' },
  { id: 'beneficiary', label: 'Beneficiary' },
  { id: 'commercial', label: 'Commercial terms' },
  { id: 'timing', label: 'Timing' },
  { id: 'route', label: 'Route' },
  { id: 'replay', label: 'Replay' },
  { id: 'evidence', label: 'Evidence' },
]

export const POLICY_EFFECTS: { id: PolicyEffect; label: string }[] = [
  { id: 'allow', label: 'Allow' },
  { id: 'warn', label: 'Warn' },
  { id: 'block', label: 'Block' },
  { id: 'require_approval', label: 'Require approval' },
]

function rule(
  partial: Omit<PolicyRule, 'pattern'> & { pattern?: string },
): PolicyRule {
  const pattern =
    partial.pattern ??
    `When ${partial.whenField} ${partial.operator} ${partial.value}, then ${partial.effect.replace('_', ' ')}`
  return { ...partial, pattern }
}

const ENTERPRISE_ACTIVE_RULES: PolicyRule[] = [
  rule({
    id: 'r-ent-src-01',
    category: 'source_authority',
    whenField: 'source_system',
    operator: 'is not in',
    value: 'approved_sources',
    effect: 'block',
  }),
  rule({
    id: 'r-ent-ben-01',
    category: 'beneficiary',
    whenField: 'beneficiary_change',
    operator: 'equals',
    value: 'true',
    effect: 'block',
  }),
  rule({
    id: 'r-ent-com-01',
    category: 'commercial',
    whenField: 'amount',
    operator: '>',
    value: '500000',
    effect: 'require_approval',
  }),
  rule({
    id: 'r-ent-tim-01',
    category: 'timing',
    whenField: 'planned_date',
    operator: '<',
    value: 'today',
    effect: 'warn',
  }),
  rule({
    id: 'r-ent-rte-01',
    category: 'route',
    whenField: 'rail',
    operator: 'is not in',
    value: 'approved_rails',
    effect: 'block',
  }),
  rule({
    id: 'r-ent-rpl-01',
    category: 'replay',
    whenField: 'obligation_id',
    operator: 'already_dispatched',
    value: 'true',
    effect: 'block',
  }),
  rule({
    id: 'r-ent-evd-01',
    category: 'evidence',
    whenField: 'proof_level',
    operator: '<',
    value: 'L2',
    effect: 'require_approval',
  }),
]

export const DEMO_POLICY_PACKS: PolicyPack[] = [
  {
    id: 'enterprise-default',
    label: 'Enterprise default',
    summary: 'Baseline release controls for domestic payroll and vendor payouts.',
    usedByDemoBatch: true,
    versions: [
      {
        id: 'pv-ent-v3',
        packId: 'enterprise-default',
        version: 'v3',
        status: 'active',
        immutable: true,
        createdAt: '2026-06-01T09:00:00Z',
        activatedAt: '2026-06-08T11:20:00Z',
        actor: 'policy.admin@acme.example',
        signature: 'sig_pol_ent_v3_a91c',
        rules: ENTERPRISE_ACTIVE_RULES,
        evidenceRequirement: {
          proofLevel: 'L2',
          mandatoryArtifacts: ['sealed_pac', 'dispatch_ack', 'settlement_observation'],
        },
        conflicts: [],
      },
      {
        id: 'pv-ent-v4-draft',
        packId: 'enterprise-default',
        version: 'v4',
        status: 'draft',
        immutable: false,
        createdAt: '2026-06-18T14:00:00Z',
        actor: 'policy.admin@acme.example',
        signature: 'sig_pol_ent_v4_draft',
        rules: [
          ...ENTERPRISE_ACTIVE_RULES,
          rule({
            id: 'r-ent-com-02',
            category: 'commercial',
            whenField: 'purpose',
            operator: 'equals',
            value: 'payroll',
            effect: 'allow',
          }),
        ],
        evidenceRequirement: {
          proofLevel: 'L2',
          mandatoryArtifacts: [
            'sealed_pac',
            'dispatch_ack',
            'settlement_observation',
            'beneficiary_version',
          ],
        },
        conflicts: [
          {
            ruleA: 'r-ent-com-01',
            ruleB: 'r-ent-com-02',
            detail: 'Payroll allow may override amount require-approval above ₹5,00,000.',
          },
        ],
      },
      {
        id: 'pv-ent-v2',
        packId: 'enterprise-default',
        version: 'v2',
        status: 'retired',
        immutable: true,
        createdAt: '2026-04-12T10:00:00Z',
        activatedAt: '2026-04-15T08:00:00Z',
        retiredAt: '2026-06-08T11:20:00Z',
        actor: 'policy.admin@acme.example',
        signature: 'sig_pol_ent_v2_retired',
        rules: ENTERPRISE_ACTIVE_RULES.slice(0, 4),
        evidenceRequirement: {
          proofLevel: 'L1',
          mandatoryArtifacts: ['sealed_pac', 'dispatch_ack'],
        },
        conflicts: [],
      },
    ],
  },
  {
    id: 'nbfc-disbursement',
    label: 'NBFC disbursement',
    summary: 'Loan disbursement pack - KYC freshness and purpose codes.',
    usedByDemoBatch: false,
    versions: [
      {
        id: 'pv-nbfc-v1',
        packId: 'nbfc-disbursement',
        version: 'v1',
        status: 'active',
        immutable: true,
        createdAt: '2026-05-02T09:00:00Z',
        activatedAt: '2026-05-10T16:00:00Z',
        actor: 'controls@acme.example',
        signature: 'sig_pol_nbfc_v1',
        rules: [
          rule({
            id: 'r-nbfc-ben-01',
            category: 'beneficiary',
            whenField: 'kyc_age_days',
            operator: '>',
            value: '90',
            effect: 'require_approval',
          }),
          rule({
            id: 'r-nbfc-com-01',
            category: 'commercial',
            whenField: 'purpose',
            operator: 'not in',
            value: 'loan_disbursement_codes',
            effect: 'block',
          }),
          rule({
            id: 'r-nbfc-evd-01',
            category: 'evidence',
            whenField: 'loan_agreement_ref',
            operator: 'is empty',
            value: 'true',
            effect: 'block',
          }),
        ],
        evidenceRequirement: {
          proofLevel: 'L3',
          mandatoryArtifacts: ['loan_agreement', 'kyc_snapshot', 'sealed_pac'],
        },
        conflicts: [],
      },
    ],
  },
  {
    id: 'cross-border-vendor',
    label: 'Cross-border vendor',
    summary: 'FX quote freshness, corridor allow-list, and remittance purpose.',
    usedByDemoBatch: false,
    versions: [
      {
        id: 'pv-xb-v1',
        packId: 'cross-border-vendor',
        version: 'v1',
        status: 'active',
        immutable: true,
        createdAt: '2026-03-20T09:00:00Z',
        activatedAt: '2026-03-22T12:00:00Z',
        actor: 'treasury@acme.example',
        signature: 'sig_pol_xb_v1',
        rules: [
          rule({
            id: 'r-xb-rte-01',
            category: 'route',
            whenField: 'beneficiary_country',
            operator: 'not in',
            value: 'approved_corridors',
            effect: 'block',
          }),
          rule({
            id: 'r-xb-com-01',
            category: 'commercial',
            whenField: 'fx_quote_age_minutes',
            operator: '>',
            value: '30',
            effect: 'block',
          }),
          rule({
            id: 'r-xb-tim-01',
            category: 'timing',
            whenField: 'fx_quote_expiry',
            operator: '<',
            value: 'dispatch_time',
            effect: 'block',
          }),
        ],
        evidenceRequirement: {
          proofLevel: 'L2',
          mandatoryArtifacts: ['fx_quote', 'sealed_pac', 'dispatch_ack'],
        },
        conflicts: [],
      },
    ],
  },
  {
    id: 'marketplace-seller',
    label: 'Marketplace seller',
    summary: 'Seller settlement pack - holdbacks and replay protection.',
    usedByDemoBatch: false,
    versions: [
      {
        id: 'pv-mkt-v2',
        packId: 'marketplace-seller',
        version: 'v2',
        status: 'draft',
        immutable: false,
        createdAt: '2026-06-20T10:00:00Z',
        actor: 'marketplace@acme.example',
        signature: 'sig_pol_mkt_v2_draft',
        rules: [
          rule({
            id: 'r-mkt-com-01',
            category: 'commercial',
            whenField: 'holdback_pct',
            operator: '<',
            value: '5',
            effect: 'warn',
          }),
          rule({
            id: 'r-mkt-rpl-01',
            category: 'replay',
            whenField: 'settlement_cycle_id',
            operator: 'already_paid',
            value: 'true',
            effect: 'block',
          }),
        ],
        evidenceRequirement: {
          proofLevel: 'L2',
          mandatoryArtifacts: ['seller_ledger_ref', 'sealed_pac'],
        },
        conflicts: [],
      },
    ],
  },
]

export const DEMO_POLICY_TEST_RESULT: PolicyTestResult = {
  batchId: DEMO_SMOKE_BATCH_ID,
  packLabel: 'Enterprise default',
  versionId: 'pv-ent-v4-draft',
  versionLabel: 'v4 (draft)',
  testedAt: '2026-06-21T08:30:00Z',
  liveDataAffected: false,
  totals: {
    allow: 11,
    warn: 1,
    block: 1,
    requireApproval: 2,
  },
  sampleImpacts: [
    {
      obligationId: 'ZORD_SCN01_PAY_01',
      effect: 'allow',
      ruleId: 'r-ent-com-02',
      rulePattern: 'When purpose equals payroll, then allow',
    },
    {
      obligationId: 'ZORD_SCN01_PAY_07',
      effect: 'block',
      ruleId: 'r-ent-ben-01',
      rulePattern: 'When beneficiary_change equals true, then block',
    },
    {
      obligationId: 'ZORD_SCN01_PAY_12',
      effect: 'require_approval',
      ruleId: 'r-ent-com-01',
      rulePattern: 'When amount > 500000, then require approval',
    },
  ],
}

export const DEMO_AI_SUGGESTIONS: AiRuleSuggestion[] = [
  {
    id: 'ai-sug-01',
    label: 'Suggestion',
    pattern: 'Second approval for vendor payouts above ₹2.5L',
    impact: 'Two sample payments would wait for a second sign-off before release.',
    why: 'Demo batch has high-value vendor rows that currently pass with a single checker.',
    accepted: false,
  },
  {
    id: 'ai-sug-02',
    label: 'Suggestion',
    pattern: 'Warn when bank confirmation is still missing',
    impact: 'Flags incomplete settlement proof earlier without stopping the payout.',
    why: 'Evidence coverage on the sample batch still has payouts waiting on bank confirmation.',
    accepted: false,
  },
  {
    id: 'ai-sug-03',
    label: 'Suggestion',
    pattern: 'Require invoice or PO before seal for supplier runs',
    impact: 'Incomplete commercial packs would need review instead of sealing quietly.',
    why: 'Matches the Vendor & supplier draft controls you asked Zord to prepare.',
    accepted: false,
  },
]

/** Sandbox follow-status for the demo batch - AI observes; registry decides. */
export function buildPolicyFollowInsight(opts: {
  attached: boolean
  versionStatus: PolicyVersionStatus
  packLabel: string
}): PolicyFollowInsight {
  const batchId = DEMO_SMOKE_BATCH_ID
  const batchLabel = 'Batch 001'
  const disclaimer =
    'Sandbox observation · Zord suggests and explains. Deterministic policy and Control Review decide - AI cannot activate, approve, or dispatch.'

  if (!opts.attached) {
    return {
      batchId,
      batchLabel,
      mode: 'not_attached',
      headline: 'No batch attached yet',
      summary: `${opts.packLabel} is not scoped to a batch. Attach it to ${batchLabel} to see how the controls would govern that payout run.`,
      followedCleanly: 0,
      needsReview: 0,
      blocked: 0,
      citations: [
        {
          label: 'Next step',
          detail: 'Use Attach after Ask Zord, or Test policy on batch, then confirm the attach prompt.',
        },
      ],
      disclaimer,
    }
  }

  if (opts.versionStatus === 'draft') {
    return {
      batchId,
      batchLabel,
      mode: 'attached_draft',
      headline: `Attached to ${batchLabel} · not enforcing yet`,
      summary: `${opts.packLabel} is scoped to ${batchId}, but this version is still a draft. Activate after you are happy with the controls - attachment alone does not move money.`,
      followedCleanly: 12,
      needsReview: 2,
      blocked: 1,
      citations: [
        {
          label: 'Sample estimate',
          detail: 'On this batch the draft would roughly allow 12, need approval on 2, and block 1 (beneficiary-change).',
        },
        {
          label: 'Control Review',
          detail: 'Open the queue to resolve blocked and incomplete items before seal.',
        },
      ],
      disclaimer,
    }
  }

  return {
    batchId,
    batchLabel,
    mode: 'attached_active',
    headline: `Governing ${batchLabel}`,
    summary: `${opts.packLabel} is active on ${batchId}. Most payouts followed policy cleanly; exceptions are waiting in Control Review - not labelled as fraud.`,
    followedCleanly: 17,
    needsReview: 2,
    blocked: 1,
    citations: [
      {
        label: 'Followed cleanly',
        detail: '17 of 20 payouts passed source, beneficiary, and commercial checks without a queue item.',
      },
      {
        label: 'Needs review',
        detail: '2 payouts need approval or missing artifacts before seal.',
      },
      {
        label: 'Blocked',
        detail: '1 beneficiary-change case cannot proceed until Control Review resolves it.',
      },
    ],
    disclaimer,
  }
}

export function activeVersionForPack(pack: PolicyPack): PolicyVersion | undefined {
  return pack.versions.find((v) => v.status === 'active') ?? pack.versions[0]
}

export function packUsedByDemoBatch(): PolicyPack {
  return DEMO_POLICY_PACKS.find((p) => p.usedByDemoBatch) ?? DEMO_POLICY_PACKS[0]!
}

export function versionJson(version: PolicyVersion): string {
  return JSON.stringify(
    {
      policy_version_id: version.id,
      pack_id: version.packId,
      version: version.version,
      status: version.status,
      evidence_requirement: version.evidenceRequirement,
      rules: version.rules.map((r) => ({
        id: r.id,
        category: r.category,
        when: { field: r.whenField, operator: r.operator, value: r.value },
        then: r.effect,
      })),
    },
    null,
    2,
  )
}

export const POLICY_STUDIO_LINKS = {
  demoBatchJournal: demoBatchHref('grid'),
  demoBatchProof: demoBatchHref('proof'),
  controlReview: '/controls/review?demo=sandbox',
  intentJournal: '/payouts/intents?demo=sandbox',
} as const
