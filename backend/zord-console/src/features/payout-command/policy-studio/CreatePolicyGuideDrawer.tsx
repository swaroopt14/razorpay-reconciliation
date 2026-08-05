'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import type {
  PolicyDraftBrief,
  PolicyEffect,
  PolicyPack,
  PolicyRule,
  PolicyRuleCategory,
} from '@/services/payout-command/demo/policyStudioDemo'

export type CreatePolicyGuideResult = {
  mode: 'draft_from_pack' | 'new_pack'
  packId: string
  packLabel: string
  purpose: string
  rules: PolicyRule[]
  proofLevel: string
  mandatoryArtifacts: string[]
  agentSummary: string
  draftBrief: PolicyDraftBrief
  /** Estimated impact on the sample batch (illustrative) */
  impactPreview: {
    wouldBlock: number
    wouldNeedApproval: number
    wouldWarn: number
    wouldAllow: number
  }
}

type CreatePolicyGuideDrawerProps = {
  open: boolean
  packs: PolicyPack[]
  defaultPackId: string
  onClose: () => void
  onComplete: (result: CreatePolicyGuideResult) => void
}

type PayoutKind = 'payroll' | 'vendor' | 'cross_border' | 'marketplace'

const PAYOUT_KINDS: {
  id: PayoutKind
  label: string
  blurb: string
  packHint: string
  artifacts: string[]
  proofLevel: string
}[] = [
  {
    id: 'payroll',
    label: 'Employee payroll',
    blurb: 'Salary and reimbursements to known people.',
    packHint: 'enterprise-default',
    artifacts: ['payroll approval', 'bank confirmation', 'employee master match'],
    proofLevel: 'L2',
  },
  {
    id: 'vendor',
    label: 'Vendor & supplier',
    blurb: 'Invoices and purchase payouts.',
    packHint: 'enterprise-default',
    artifacts: ['invoice / PO match', 'payment approval', 'bank confirmation'],
    proofLevel: 'L2',
  },
  {
    id: 'cross_border',
    label: 'Cross-border',
    blurb: 'Payments to overseas beneficiaries.',
    packHint: 'cross-border-vendor',
    artifacts: ['FX quote', 'corridor approval', 'payment approval', 'bank confirmation'],
    proofLevel: 'L3',
  },
  {
    id: 'marketplace',
    label: 'Marketplace sellers',
    blurb: 'Seller settlements and holdbacks.',
    packHint: 'marketplace-seller',
    artifacts: ['seller ledger reference', 'holdback check', 'bank confirmation'],
    proofLevel: 'L2',
  },
]

const CONTROLS: {
  id: string
  label: string
  blurb: string
  effect: PolicyEffect
  category: PolicyRuleCategory
  whenField: string
  operator: string
  value: string
  pattern: (thresholdLakh: string) => string
}[] = [
  {
    id: 'beneficiary_change',
    label: 'Stop if the payee details change',
    blurb: 'Do not release when bank account or name was updated after approval.',
    effect: 'block',
    category: 'beneficiary',
    whenField: 'beneficiary_change',
    operator: 'equals',
    value: 'true',
    pattern: () => 'If payee details change after approval → stop release',
  },
  {
    id: 'high_amount',
    label: 'Ask for a second approval on large amounts',
    blurb: 'Anything above your threshold needs another sign-off.',
    effect: 'require_approval',
    category: 'commercial',
    whenField: 'amount',
    operator: '>',
    value: '500000',
    pattern: (t) => `If amount is above ₹${t}L → require second approval`,
  },
  {
    id: 'late_date',
    label: 'Flag payouts past the planned date',
    blurb: 'Warn the team - do not hard-block by default.',
    effect: 'warn',
    category: 'timing',
    whenField: 'planned_date',
    operator: '<',
    value: 'today',
    pattern: () => 'If planned date is in the past → warn before release',
  },
  {
    id: 'unknown_rail',
    label: 'Only use approved payment rails',
    blurb: 'Block releases on rails your treasury has not approved.',
    effect: 'block',
    category: 'route',
    whenField: 'rail',
    operator: 'is not in',
    value: 'approved_rails',
    pattern: () => 'If payment rail is not approved → stop release',
  },
]

const EXTRA_BY_KIND: Record<
  PayoutKind,
  {
    id: string
    label: string
    effect: PolicyEffect
    category: PolicyRuleCategory
    whenField: string
    operator: string
    value: string
    pattern: string
  }[]
> = {
  payroll: [
    {
      id: 'payroll_source',
      label: 'Accept only from the payroll file source',
      effect: 'block',
      category: 'source_authority',
      whenField: 'source_system',
      operator: 'is not in',
      value: 'payroll_sources',
      pattern: 'If source is not an approved payroll system → stop release',
    },
  ],
  vendor: [
    {
      id: 'vendor_invoice',
      label: 'Require an invoice or purchase reference',
      effect: 'require_approval',
      category: 'commercial',
      whenField: 'business_reference',
      operator: 'is empty',
      value: 'true',
      pattern: 'If invoice / PO reference is missing → require approval',
    },
  ],
  cross_border: [
    {
      id: 'fx_fresh',
      label: 'Require a fresh FX quote',
      effect: 'block',
      category: 'commercial',
      whenField: 'fx_quote_age_minutes',
      operator: '>',
      value: '30',
      pattern: 'If FX quote is older than 30 minutes → stop release',
    },
  ],
  marketplace: [
    {
      id: 'holdback',
      label: 'Warn when seller holdback is below 5%',
      effect: 'warn',
      category: 'commercial',
      whenField: 'holdback_pct',
      operator: '<',
      value: '5',
      pattern: 'If seller holdback is below 5% → warn before release',
    },
  ],
}

const ROLES = [
  { id: 'treasury', label: 'Treasury' },
  { id: 'finance_ops', label: 'Finance operations' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'business_owner', label: 'Business owner' },
] as const

type Phase = 'chat' | 'drafting' | 'ready'

function estimateImpact(controlIds: string[]) {
  let wouldBlock = 0
  let wouldNeedApproval = 0
  let wouldWarn = 0
  if (controlIds.includes('beneficiary_change')) wouldBlock += 1
  if (controlIds.includes('unknown_rail')) wouldBlock += 1
  if (controlIds.includes('high_amount')) wouldNeedApproval += 2
  if (controlIds.includes('late_date')) wouldWarn += 1
  const used = wouldBlock + wouldNeedApproval + wouldWarn
  const wouldAllow = Math.max(0, 15 - used)
  return { wouldBlock, wouldNeedApproval, wouldWarn, wouldAllow }
}

/**
  * Right-side Zord agent - helps business users draft a policy. Never activates.
  */
export function CreatePolicyGuideDrawer({
  open,
  packs,
  defaultPackId,
  onClose,
  onComplete,
}: CreatePolicyGuideDrawerProps) {
  const titleId = useId()
  const [phase, setPhase] = useState<Phase>('chat')
  const [step, setStep] = useState(1)
  const [kind, setKind] = useState<PayoutKind>('payroll')
  const [selectedControls, setSelectedControls] = useState<string[]>(['beneficiary_change', 'high_amount'])
  const [thresholdLakh, setThresholdLakh] = useState('5')
  const [approverRole, setApproverRole] = useState('treasury')
  const [activatorRole, setActivatorRole] = useState('compliance')
  const [note, setNote] = useState('')
  const [includeKindExtras, setIncludeKindExtras] = useState(true)

  useEffect(() => {
    if (!open) return
    setPhase('chat')
    setStep(1)
    setKind('payroll')
    setSelectedControls(['beneficiary_change', 'high_amount'])
    setThresholdLakh('5')
    setApproverRole('treasury')
    setActivatorRole('compliance')
    setNote('')
    setIncludeKindExtras(true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const kindMeta = PAYOUT_KINDS.find((k) => k.id === kind)!
  const pack =
    packs.find((p) => p.id === kindMeta.packHint) ??
    packs.find((p) => p.id === defaultPackId) ??
    packs[0]

  const approverLabel = ROLES.find((r) => r.id === approverRole)?.label ?? approverRole
  const activatorLabel = ROLES.find((r) => r.id === activatorRole)?.label ?? activatorRole

  const builtRules = useMemo(() => {
    const amountValue = String(Math.max(1, Number(thresholdLakh) || 5) * 100_000)
    const fromControls: PolicyRule[] = CONTROLS.filter((c) => selectedControls.includes(c.id)).map(
      (c, i) => ({
        id: `r-zord-${c.id}-${i}`,
        category: c.category,
        whenField: c.whenField,
        operator: c.operator,
        value: c.id === 'high_amount' ? amountValue : c.value,
        effect: c.effect,
        pattern: c.pattern(thresholdLakh || '5'),
        businessLabel:
          c.id === 'high_amount' ? `Second approval above ₹${thresholdLakh || '5'}L` : c.label,
      }),
    )
    const extras = includeKindExtras
      ? EXTRA_BY_KIND[kind].map((c, i) => ({
          id: `r-zord-${c.id}-${i}`,
          category: c.category,
          whenField: c.whenField,
          operator: c.operator,
          value: c.value,
          effect: c.effect,
          pattern: c.pattern,
          businessLabel: c.label,
        }))
      : []
    return [...fromControls, ...extras]
  }, [selectedControls, thresholdLakh, kind, includeKindExtras])

  const impactPreview = useMemo(
    () => estimateImpact(selectedControls),
    [selectedControls],
  )

  if (!open) return null

  function toggleControl(id: string) {
    setSelectedControls((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function runAgentDraft() {
    setPhase('drafting')
    window.setTimeout(() => setPhase('ready'), 1100)
  }

  function finish() {
    const controlLabels = builtRules.map((r) => r.businessLabel || r.pattern)
    const businessNote = note.trim() || undefined
    const purpose = [
      `Release policy for ${kindMeta.label.toLowerCase()}.`,
      `${builtRules.length} controls drafted by Zord.`,
      businessNote ? `Business note: ${businessNote}.` : '',
      `Exceptions: ${approverLabel}. Go-live: ${activatorLabel}.`,
    ]
      .filter(Boolean)
      .join(' ')

    const draftBrief: PolicyDraftBrief = {
      draftedByAgent: true,
      payoutKind: kindMeta.label,
      purpose,
      businessNote,
      approverRole: approverLabel,
      activatorRole: activatorLabel,
      controlLabels,
      amountThresholdLakh: selectedControls.includes('high_amount') ? thresholdLakh || '5' : undefined,
      impactNote: `On the sample batch this draft would roughly: allow ${impactPreview.wouldAllow}, warn ${impactPreview.wouldWarn}, need approval ${impactPreview.wouldNeedApproval}, block ${impactPreview.wouldBlock}.`,
    }

    const agentSummary = `Zord saved a draft for ${kindMeta.label} (${builtRules.length} controls). ${approverLabel} reviews exceptions; only ${activatorLabel} can make it live.`

    onComplete({
      mode: 'draft_from_pack',
      packId: pack.id,
      packLabel: pack.label,
      purpose,
      rules: builtRules,
      proofLevel: kindMeta.proofLevel,
      mandatoryArtifacts: kindMeta.artifacts,
      agentSummary,
      draftBrief,
      impactPreview,
    })
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        className="absolute inset-0 bg-[#0B1324]/30"
        aria-label="Close"
        onClick={onClose}
      />

      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-[#E2E8F0] bg-white shadow-2xl"
        style={{ animation: 'policyAgentIn 220ms ease-out' }}
      >
        <style>{`
          @keyframes policyAgentIn {
            from { transform: translateX(100%); opacity: 0.9; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        <header className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center bg-[#0B1324] text-[11px] font-bold text-white">
              Z
            </span>
            <div>
              <h2 id={titleId} className="text-[16px] font-semibold text-[#0B1324]">
                Ask Zord
              </h2>
              <p className="text-[12px] text-[#64748B]">Draft a release policy with me</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-[18px] text-[#94A3B8] hover:text-[#0B1324]"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {phase === 'drafting' ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
              <div className="h-8 w-8 animate-pulse bg-[#0B1324]" />
              <p className="text-[14px] font-semibold text-[#0B1324]">Zord is preparing your draft…</p>
              <p className="max-w-xs text-[12px] text-[#64748B]">
                Writing {selectedControls.length + (includeKindExtras ? EXTRA_BY_KIND[kind].length : 0)}{' '}
                controls, permissions, and proof expectations. Nothing goes live yet.
              </p>
            </div>
          ) : null}

          {phase === 'ready' ? (
            <div className="space-y-4">
              <div className="border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B1324]">
                  Draft ready · not live
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-[#0B1324]">
                  Zord prepared <span className="font-semibold">{builtRules.length} controls</span> for{' '}
                  <span className="font-semibold">{kindMeta.label}</span> in{' '}
                  <span className="font-semibold">{pack.label}</span>.
                </p>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#0B1324]">Controls in this draft</p>
                <ul className="mt-2 space-y-2">
                  {builtRules.map((r) => (
                    <li key={r.id} className="border border-[#E2E8F0] px-3 py-2.5">
                      <p className="text-[13px] font-semibold text-[#0B1324]">
                        {r.businessLabel || r.pattern}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">{r.pattern}</p>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#94A3B8]">
                        {r.effect.replace('_', ' ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="border border-[#E2E8F0] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                    Exceptions
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[#0B1324]">{approverLabel}</p>
                </div>
                <div className="border border-[#E2E8F0] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                    Can go live
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[#0B1324]">{activatorLabel}</p>
                </div>
              </div>

              <div className="border border-[#E2E8F0] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                  Must be proven
                </p>
                <p className="mt-1 text-[13px] text-[#0B1324]">
                  Level {kindMeta.proofLevel} · {kindMeta.artifacts.join(', ')}
                </p>
              </div>

              <div className="border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                  Sample batch impact (estimate)
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[#475569]">
                  <span>
                    <span className="font-semibold text-[#0B1324]">{impactPreview.wouldAllow}</span>{' '}
                    allow
                  </span>
                  <span>
                    <span className="font-semibold text-[#0B1324]">{impactPreview.wouldWarn}</span> warn
                  </span>
                  <span>
                    <span className="font-semibold text-[#0B1324]">
                      {impactPreview.wouldNeedApproval}
                    </span>{' '}
                    approval
                  </span>
                  <span>
                    <span className="font-semibold text-[#0B1324]">{impactPreview.wouldBlock}</span> block
                  </span>
                </div>
              </div>

              {note.trim() ? (
                <div className="border border-[#E2E8F0] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                    Your note
                  </p>
                  <p className="mt-1 text-[13px] text-[#475569]">{note.trim()}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === 'chat' ? (
            <div className="space-y-5">
              <div className="border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3">
                <p className="text-[13px] leading-relaxed text-[#0B1324]">
                  I’ll draft the release rules with you - what to protect, who decides, and what must
                  be proven. You stay in control of go-live.
                </p>
              </div>

              {step === 1 ? (
                <div className="space-y-3">
                  <p className="text-[14px] font-semibold text-[#0B1324]">
                    What kind of payouts is this for?
                  </p>
                  <div className="space-y-2">
                    {PAYOUT_KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setKind(k.id)}
                        className={`w-full border px-3.5 py-3 text-left transition ${
                          kind === k.id
                            ? 'border-[#0B1324] bg-[#F8FAFC]'
                            : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
                        }`}
                      >
                        <span className="block text-[13px] font-semibold text-[#0B1324]">{k.label}</span>
                        <span className="mt-0.5 block text-[12px] text-[#64748B]">{k.blurb}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-3">
                  <p className="text-[14px] font-semibold text-[#0B1324]">
                    What should we protect before money leaves?
                  </p>
                  <div className="space-y-2">
                    {CONTROLS.map((c) => {
                      const on = selectedControls.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleControl(c.id)}
                          className={`w-full border px-3.5 py-3 text-left transition ${
                            on ? 'border-[#0B1324] bg-[#F8FAFC]' : 'border-[#E2E8F0] bg-white'
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span>
                              <span className="block text-[13px] font-semibold text-[#0B1324]">
                                {c.label}
                              </span>
                              <span className="mt-0.5 block text-[12px] text-[#64748B]">{c.blurb}</span>
                            </span>
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-bold ${
                                on ? 'bg-[#0B1324] text-white' : 'border border-[#CBD5E1] text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {selectedControls.includes('high_amount') ? (
                    <label className="block">
                      <span className="text-[12px] font-semibold text-[#0B1324]">
                        Large amount starts at (₹ lakhs)
                      </span>
                      <input
                        className="mt-1 h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px]"
                        value={thresholdLakh}
                        onChange={(e) => setThresholdLakh(e.target.value.replace(/[^\d.]/g, ''))}
                        inputMode="decimal"
                      />
                    </label>
                  ) : null}
                  <label className="flex items-start gap-2 border border-[#E2E8F0] px-3 py-2.5 text-[12px] text-[#475569]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={includeKindExtras}
                      onChange={(e) => setIncludeKindExtras(e.target.checked)}
                    />
                    <span>
                      Also include recommended checks for {kindMeta.label.toLowerCase()}
                      <span className="mt-0.5 block text-[#94A3B8]">
                        {EXTRA_BY_KIND[kind].map((x) => x.label).join(' · ')}
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <p className="text-[14px] font-semibold text-[#0B1324]">Who owns the decisions?</p>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#0B1324]">
                      Who reviews exceptions?
                    </span>
                    <select
                      className="mt-1 h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px]"
                      value={approverRole}
                      onChange={(e) => setApproverRole(e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#0B1324]">
                      Who can make this policy live?
                    </span>
                    <select
                      className="mt-1 h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px]"
                      value={activatorRole}
                      onChange={(e) => setActivatorRole(e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-[#94A3B8]">
                      Going live is always logged. Zord cannot activate for you.
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#0B1324]">
                      Anything else Zord should know? (optional)
                    </span>
                    <textarea
                      className="mt-1 min-h-[88px] w-full border border-[#CBD5E1] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#2563EB]"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Weekend payrolls need same-day settlement checks."
                    />
                  </label>
                  <div className="border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[12px] text-[#475569]">
                    Next, Zord will draft about{' '}
                    <span className="font-semibold text-[#0B1324]">
                      {selectedControls.length +
                        (includeKindExtras ? EXTRA_BY_KIND[kind].length : 0)}{' '}
                      controls
                    </span>{' '}
                    for {kindMeta.label.toLowerCase()}.
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="border-t border-[#E2E8F0] px-5 py-3">
          {phase === 'chat' ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))}
                className="h-9 px-3 text-[13px] font-semibold text-[#64748B] hover:text-[#0B1324]"
              >
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  disabled={selectedControls.length === 0}
                  onClick={runAgentDraft}
                  className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:bg-[#CBD5E1]"
                >
                  Let Zord draft
                </button>
              )}
            </div>
          ) : null}
          {phase === 'ready' ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhase('chat')
                  setStep(2)
                }}
                className="h-9 px-3 text-[13px] font-semibold text-[#64748B] hover:text-[#0B1324]"
              >
                Adjust
              </button>
              <button
                type="button"
                onClick={finish}
                className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Save draft ({builtRules.length} controls)
              </button>
            </div>
          ) : null}
          {phase === 'drafting' ? (
            <p className="text-center text-[12px] text-[#94A3B8]">Working…</p>
          ) : null}
        </footer>
      </aside>
    </div>
  )
}
