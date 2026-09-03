'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SCENARIO_CROSS_BORDER, withScenarioScope } from '@/services/payout-command/demo/scenarioMode'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import type { AuthorityBatch, BatchControl } from './authorityBatchTypes'
import BATCH_DATA from '@/data/authority-batches.json'

const INSPECTOR_KEY = 'zord-authority-inspector-collapsed'

const FLOW_STEPS = [
  { id: 'source', label: 'Source' },
  { id: 'policy', label: 'Policy' },
  { id: 'authority', label: 'Authority' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'contract', label: 'Contract' },
] as const

type Tab = 'pending' | 'authorized' | 'rejected' | 'all'
type BS = 'pending' | 'authorized' | 'rejected'

function fmtAmt(amount: number, currency: string) {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function fmtCr(amount: number, currency: string) {
  if (currency === 'INR' && amount >= 10_000_000) {
    const cr = amount / 10_000_000
    const n = Number.isInteger(cr) ? String(cr) : cr.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return `₹${n} Cr`
  }
  return fmtAmt(amount, currency)
}

function StatusDot({ status }: { status: BS }) {
  const cls =
    status === 'authorized' ? 'bg-[#138A63]' : status === 'rejected' ? 'bg-[#C2413B]' : 'bg-[#B7791F]'
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} aria-hidden />
}

function StatusLabel({ status }: { status: BS }) {
  if (status === 'authorized') return <span className="text-[12px] font-semibold text-[#138A63]">Authorized</span>
  if (status === 'rejected') return <span className="text-[12px] font-semibold text-[#C2413B]">Rejected</span>
  return <span className="text-[12px] font-semibold text-[#B7791F]">Pending</span>
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</p>
      <p className={`mt-1 text-[13px] font-medium text-[#0B1324] ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</p>
    </div>
  )
}

export function AuthorityConsoleSurface({ traceId }: { traceId?: string }) {
  return (
    <UploadGate title="No payment obligations yet">
      <Body traceId={traceId} />
    </UploadGate>
  )
}

function Body({ traceId }: { traceId?: string }) {
  const allBatches = useMemo(() => (BATCH_DATA as { batches: AuthorityBatch[] }).batches, [])
  const [statuses, setStatuses] = useState<Record<string, BS>>(() =>
    Object.fromEntries(allBatches.map((b) => [b.batchId, 'pending'])),
  )
  const [extras, setExtras] = useState<Record<string, BatchControl[]>>(() =>
    Object.fromEntries(allBatches.map((b) => [b.batchId, []])),
  )
  const [selId, setSelId] = useState(
    () =>
      allBatches.find((b) => b.protocol.traceId === traceId)?.batchId ??
      allBatches.find((b) => b.batchId === 'BCH-003')?.batchId ??
      allBatches[0]!.batchId,
  )
  const [tab, setTab] = useState<Tab>('pending')
  const [flowStep, setFlowStep] = useState(0)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [ruleText, setRuleText] = useState('')
  const [ruleSev, setRuleSev] = useState<'critical' | 'high' | 'medium'>('high')
  const [msg, setMsg] = useState<string | null>(null)
  const href = (p: string) => withScenarioScope(p, SCENARIO_CROSS_BORDER)

  useEffect(() => {
    try {
      setInspectorCollapsed(sessionStorage.getItem(INSPECTOR_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleInspector = useCallback(() => {
    setInspectorCollapsed((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem(INSPECTOR_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const showMsg = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 2800)
  }, [])

  const batch = allBatches.find((b) => b.batchId === selId) ?? allBatches[0]!
  const bs = statuses[batch.batchId] ?? 'pending'
  const allCtrls = [...batch.policy.controls, ...(extras[batch.batchId] ?? [])]
  const firstAppr = batch.approvals.approvers[0]
  const step = FLOW_STEPS[flowStep] ?? FLOW_STEPS[0]!

  const visible = useMemo(() => {
    if (tab === 'all') return allBatches
    return allBatches.filter((b) => statuses[b.batchId] === tab)
  }, [allBatches, tab, statuses])

  const pc = useMemo(() => allBatches.filter((b) => statuses[b.batchId] === 'pending').length, [allBatches, statuses])
  const ac = useMemo(() => allBatches.filter((b) => statuses[b.batchId] === 'authorized').length, [allBatches, statuses])
  const rc = useMemo(() => allBatches.filter((b) => statuses[b.batchId] === 'rejected').length, [allBatches, statuses])
  const inrE = useMemo(
    () =>
      allBatches
        .filter((b) => statuses[b.batchId] === 'pending' && b.summary.currency === 'INR')
        .reduce((s, b) => s + b.summary.totalAmount, 0),
    [allBatches, statuses],
  )
  const usdE = useMemo(
    () =>
      allBatches
        .filter((b) => statuses[b.batchId] === 'pending' && b.summary.currency === 'USD')
        .reduce((s, b) => s + b.summary.totalAmount, 0),
    [allBatches, statuses],
  )

  function selectBatch(id: string) {
    setSelId(id)
    setFlowStep(0)
    setRuleText('')
  }

  function approve() {
    setStatuses((p) => ({ ...p, [batch.batchId]: 'authorized' }))
    showMsg(`${batch.batchNumber} authorized`)
    setFlowStep(FLOW_STEPS.length - 1)
  }
  function reject() {
    setStatuses((p) => ({ ...p, [batch.batchId]: 'rejected' }))
    showMsg(`${batch.batchNumber} rejected`)
  }

  function addRule() {
    if (!ruleText.trim()) return
    const ctrl: BatchControl = {
      id: `U-${Date.now().toString(36)}`,
      name: ruleText.trim(),
      description: ruleText.trim(),
      severity: ruleSev,
    }
    setExtras((p) => ({ ...p, [batch.batchId]: [...(p[batch.batchId] ?? []), ctrl] }))
    setRuleText('')
    showMsg(`Rule added`)
  }

  function removeRule(id: string) {
    setExtras((p) => ({ ...p, [batch.batchId]: (p[batch.batchId] ?? []).filter((r) => r.id !== id) }))
  }

  const exposure =
    [inrE > 0 ? fmtCr(inrE, 'INR') : '', usdE > 0 ? fmtAmt(usdE, 'USD') : ''].filter(Boolean).join(' + ') || '—'

  const chain = [
    {
      l: 'Enterprise root',
      n: batch.authority.enterpriseRoot.name,
      id: batch.authority.enterpriseRoot.id,
      ok: batch.authority.enterpriseRoot.verification === 'verified',
    },
    {
      l: 'Delegating role',
      n: batch.authority.delegatingRole.name,
      id: batch.authority.delegatingRole.id,
      ok: batch.authority.delegatingRole.verification === 'verified',
    },
    { l: 'Agent credential', n: batch.agent.name, id: batch.agent.agentId, ok: true },
    {
      l: 'Action scope',
      n: batch.authority.actionScope.action.replace(/_/g, ' '),
      id: batch.authority.actionScope.scope,
      ok: bs === 'authorized',
    },
  ]

  const protocolRows = [
    ['Action Proposal', batch.protocol.objects.actionProposal.id],
    ['Authority Credential', batch.protocol.objects.authorityCredential.id],
    ['Policy Decision Receipt', batch.protocol.objects.policyDecisionReceipt.id],
    ['Approval Evidence', batch.protocol.objects.approvalEvidence.id],
    ['Payment Action Contract', batch.protocol.objects.paymentActionContract.id],
  ] as const

  return (
    <div className="flex min-h-full flex-col bg-[#F7F8FB]">
      <header className="border-b border-[#D8DEE9] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Authority
          </p>
          <span className="inline-flex h-5 items-center rounded-full bg-[#EEF2F7] px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
            Sandbox
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[#0B1324]">Review payout authority</h1>
            <p className="mt-1 text-[13px] text-[#64748B]">
              Confirm source, policy, and approvals before a Payment Action Contract can be sealed.
            </p>
          </div>
          <p className="text-[12px] tabular-nums text-[#64748B]">
            <span className="font-semibold text-[#0B1324]">{pc}</span> pending
            <span className="mx-2 text-[#D8DEE9]">·</span>
            <span className="font-semibold text-[#0B1324]">{exposure}</span> exposure
          </p>
        </div>
      </header>

      {msg ? (
        <div className="border-b border-[#D8DEE9] bg-white px-6 py-2 text-[13px] text-[#138A63]">{msg}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-[#D8DEE9] bg-white lg:w-[260px] lg:border-b-0 lg:border-r" aria-label="Batch queue">
          <div className="flex gap-1 border-b border-[#E2E8F0] px-3 py-2">
            {(
              [
                ['pending', 'Pending', pc],
                ['authorized', 'Done', ac],
                ['rejected', 'Rejected', rc],
                ['all', 'All', allBatches.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-[6px] px-2 py-1 text-[11px] font-semibold ${
                  tab === id ? 'bg-[#0B1324] text-white' : 'text-[#64748B] hover:bg-[#F1F5F9]'
                }`}
              >
                {label} {count}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-4 py-8 text-center text-[12px] text-[#94A3B8]">No batches</li>
            ) : (
              visible.map((b) => {
                const s = statuses[b.batchId] ?? 'pending'
                const selected = selId === b.batchId
                return (
                  <li key={b.batchId}>
                    <button
                      type="button"
                      onClick={() => selectBatch(b.batchId)}
                      className={`flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left ${
                        selected
                          ? 'border-[#0B1324] bg-[#F8FAFC]'
                          : 'border-transparent hover:bg-[#FAFBFC]'
                      }`}
                    >
                      <StatusDot status={s} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[#0B1324]">{b.batchNumber}</p>
                        <p className="mt-0.5 text-[11px] text-[#94A3B8]">{b.batchId}</p>
                        <p className="mt-1.5 text-[13px] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                          {fmtCr(b.summary.totalAmount, b.summary.currency)}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </aside>

        <main className="flex min-w-0 min-h-0 flex-1 flex-col bg-white">
          <div className="border-b border-[#E2E8F0] px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{batch.batchId}</p>
                <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-[#0B1324]">{batch.batchNumber}</h2>
                <p className="mt-1 text-[13px] text-[#64748B]">
                  {batch.agent.name}
                  <span className="mx-1.5 text-[#D8DEE9]">·</span>
                  {batch.policy.name} {batch.policy.version}
                  <span className="mx-1.5 text-[#D8DEE9]">·</span>
                  {batch.summary.instructionCount} instructions
                </p>
              </div>
              <div className="text-right">
                <p className="text-[22px] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                  {fmtCr(batch.summary.totalAmount, batch.summary.currency)}
                </p>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  {fmtAmt(batch.summary.totalAmount, batch.summary.currency)}
                  <span className="mx-1.5 text-[#D8DEE9]">·</span>
                  {batch.summary.currency}
                </p>
                <div className="mt-2 flex justify-end">
                  <StatusLabel status={bs} />
                </div>
              </div>
            </div>

            <nav className="mt-5 flex items-center gap-0 overflow-x-auto" aria-label="Review flow">
              {FLOW_STEPS.map((item, i) => {
                const active = i === flowStep
                const done = i < flowStep
                return (
                  <div key={item.id} className="flex items-center">
                    {i > 0 ? (
                      <span className={`mx-1 h-px w-5 sm:w-8 ${done || active ? 'bg-[#0B1324]' : 'bg-[#E2E8F0]'}`} />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setFlowStep(i)}
                      className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-semibold tracking-[0.04em] ${
                        active
                          ? 'bg-[#0B1324] text-white'
                          : done
                            ? 'text-[#138A63] hover:bg-[#F1F5F9]'
                            : 'text-[#94A3B8] hover:bg-[#F8FAFC]'
                      }`}
                      aria-current={active ? 'step' : undefined}
                    >
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                          active ? 'bg-white text-[#0B1324]' : done ? 'bg-[#138A63] text-white' : 'bg-[#E2E8F0] text-[#94A3B8]'
                        }`}
                      >
                        {done ? '✓' : i + 1}
                      </span>
                      {item.label}
                    </button>
                  </div>
                )
              })}
            </nav>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {step.id === 'source' ? (
              <div className="max-w-[640px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Source & proposal</p>
                <div className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                  <Field label="Agent" value={batch.agent.name} />
                  <Field label="Agent ID" value={batch.agent.agentId} mono />
                  <Field label="Source" value={batch.sourceProposal.sourceReference} />
                  <Field label="Proposal ID" value={batch.sourceProposal.proposalId} mono />
                  <Field label="Business reason" value={batch.sourceProposal.businessReason} />
                  <Field label="Created by" value={batch.sourceProposal.createdBy} mono />
                </div>
                <Link
                  href={href(`/actions/${batch.protocol.traceId}`)}
                  className="mt-6 inline-flex text-[13px] font-semibold text-[#2E5BFF] hover:underline"
                >
                  View proposal
                </Link>
              </div>
            ) : null}

            {step.id === 'policy' ? (
              <div className="max-w-[720px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Policy & controls</p>
                <div className="mt-4">
                  <p className="text-[16px] font-semibold text-[#0B1324]">
                    {batch.policy.name} {batch.policy.version}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-[#64748B]">{batch.policy.namespace}</p>
                </div>
                <ul className="mt-5 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
                  {allCtrls.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#0B1324]">{c.name}</p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-[#64748B]">{c.description}</p>
                      </div>
                      {c.id.startsWith('U-') ? (
                        <button
                          type="button"
                          onClick={() => removeRule(c.id)}
                          className="shrink-0 text-[12px] font-semibold text-[#C2413B]"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                          {c.severity}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]" htmlFor="user-rule">
                      Add control
                    </label>
                    <input
                      id="user-rule"
                      type="text"
                      value={ruleText}
                      onChange={(e) => setRuleText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRule()}
                      placeholder="e.g. Max 3 retries"
                      className="mt-1 h-9 w-full border border-[#D8DEE9] bg-white px-3 text-[13px] text-[#0B1324] outline-none focus:border-[#0B1324]"
                    />
                  </div>
                  <select
                    value={ruleSev}
                    onChange={(e) => setRuleSev(e.target.value as typeof ruleSev)}
                    className="h-9 border border-[#D8DEE9] bg-white px-2 text-[12px] text-[#0B1324]"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                  </select>
                  <button
                    type="button"
                    onClick={addRule}
                    disabled={!ruleText.trim()}
                    className="h-9 bg-[#0B1324] px-4 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}

            {step.id === 'authority' ? (
              <div className="max-w-[480px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Authority chain</p>
                <ol className="mt-5">
                  {chain.map((nd, i) => (
                    <li key={nd.id} className="flex gap-4">
                      <div className="flex w-4 flex-col items-center">
                        <span
                          className={`mt-1 h-2.5 w-2.5 rounded-full ${nd.ok ? 'bg-[#138A63]' : 'border-2 border-[#D8DEE9] bg-white'}`}
                        />
                        {i < chain.length - 1 ? <span className="w-px flex-1 bg-[#E2E8F0]" /> : null}
                      </div>
                      <div className={`min-w-0 flex-1 ${i < chain.length - 1 ? 'pb-5' : ''}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">{nd.l}</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">{nd.n}</p>
                        <p className="font-mono text-[11px] text-[#94A3B8]">{nd.id}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {step.id === 'approvals' ? (
              <div className="max-w-[520px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Approvals</p>
                <ul className="mt-5 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
                  {batch.approvals.approvers.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-3.5">
                      <div>
                        <p className="text-[13px] font-semibold text-[#0B1324]">{a.role}</p>
                        <p className="text-[12px] text-[#64748B]">{a.name}</p>
                      </div>
                      <StatusLabel status={bs === 'authorized' ? 'authorized' : 'pending'} />
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12px] text-[#64748B]">
                  Separation of duties
                  <span className="ml-2 font-semibold text-[#0B1324]">
                    {batch.approvals.separationOfDuties.required
                      ? bs === 'authorized'
                        ? 'Satisfied'
                        : 'Required'
                      : 'Not required'}
                  </span>
                </p>
              </div>
            ) : null}

            {step.id === 'contract' ? (
              <div className="max-w-[560px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Contract & dispatch</p>
                <dl className="mt-5 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
                  <div className="flex items-baseline justify-between py-3.5">
                    <dt className="text-[13px] text-[#64748B]">Payment Action Contract</dt>
                    <dd className={`text-[13px] font-semibold ${bs === 'authorized' ? 'text-[#138A63]' : 'text-[#94A3B8]'}`}>
                      {bs === 'authorized' ? 'Ready to create' : 'Not created'}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between py-3.5">
                    <dt className="text-[13px] text-[#64748B]">Dispatch</dt>
                    <dd className={`text-[13px] font-semibold ${bs === 'authorized' ? 'text-[#138A63]' : 'text-[#C2413B]'}`}>
                      {bs === 'authorized' ? 'Ready' : 'Blocked'}
                    </dd>
                  </div>
                </dl>
                {bs === 'authorized' ? (
                  <Link
                    href={href(`/actions/${batch.protocol.traceId}`)}
                    className="mt-5 inline-flex h-9 items-center bg-[#0B1324] px-4 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
                  >
                    Open Payment Action Contract
                  </Link>
                ) : (
                  <p className="mt-5 text-[13px] text-[#64748B]">Authorize this batch to unlock PAC and dispatch.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#E2E8F0] px-6 py-3">
            <button
              type="button"
              onClick={() => setFlowStep((n) => Math.max(0, n - 1))}
              disabled={flowStep === 0}
              className="h-9 border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC] disabled:opacity-35"
            >
              Back
            </button>
            <p className="text-[12px] tabular-nums text-[#94A3B8]">
              {flowStep + 1} / {FLOW_STEPS.length}
            </p>
            <button
              type="button"
              onClick={() => setFlowStep((n) => Math.min(FLOW_STEPS.length - 1, n + 1))}
              disabled={flowStep === FLOW_STEPS.length - 1}
              className="h-9 bg-[#0B1324] px-4 text-[12px] font-semibold text-white hover:bg-[#1E293B] disabled:opacity-35"
            >
              {FLOW_STEPS[flowStep + 1] ? `Next · ${FLOW_STEPS[flowStep + 1]!.label}` : 'Done'}
            </button>
          </div>
        </main>

        <aside
          className={`flex shrink-0 flex-col border-[#D8DEE9] bg-[#FAFBFC] lg:border-l ${
            inspectorCollapsed ? 'border-t lg:w-11' : 'w-full border-t lg:w-[280px] lg:border-t-0'
          }`}
          aria-label="Batch inspector"
        >
          <div className={`flex items-center border-b border-[#E2E8F0] ${inspectorCollapsed ? 'justify-center py-2' : 'justify-between px-4 py-3'}`}>
            {inspectorCollapsed ? null : (
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Inspector</p>
            )}
            <button
              type="button"
              onClick={toggleInspector}
              className="flex h-7 w-7 items-center justify-center text-[#94A3B8] hover:bg-[#EEF2F7] hover:text-[#0B1324]"
              aria-expanded={!inspectorCollapsed}
              aria-label={inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
                {inspectorCollapsed ? (
                  <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>

          {inspectorCollapsed ? (
            <button
              type="button"
              onClick={toggleInspector}
              className="flex items-center gap-2 px-3 py-2.5 lg:flex-1 lg:flex-col lg:gap-3 lg:px-1 lg:py-4"
              title={`${batch.batchNumber} · ${batch.batchId}`}
            >
              <StatusDot status={bs} />
              <span className="text-[11px] font-semibold text-[#0B1324] lg:hidden">
                {batch.batchId}
              </span>
              <span
                className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B] lg:inline"
                style={{ writingMode: 'vertical-rl' }}
              >
                {batch.batchId}
              </span>
            </button>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[#0B1324]">{batch.batchId}</p>
                <StatusLabel status={bs} />
              </div>
              <dl className="mt-4 space-y-3">
                {(
                  [
                    ['Amount', fmtCr(batch.summary.totalAmount, batch.summary.currency)],
                    ['Exact', fmtAmt(batch.summary.totalAmount, batch.summary.currency)],
                    ['Instructions', String(batch.summary.instructionCount)],
                    ['Agent', batch.agent.agentId],
                    ['Policy', `${batch.policy.name} ${batch.policy.version}`],
                    ['Trace', batch.protocol.traceId],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l}>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{l}</dt>
                    <dd className="mt-0.5 break-all text-[12px] font-medium text-[#0B1324]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                Protocol objects
              </p>
              <ul className="mt-3 space-y-3">
                {protocolRows.map(([name, id]) => (
                  <li key={name} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#0B1324]">{name}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-[#94A3B8]">{id || 'Not created'}</p>
                    </div>
                    {id ? (
                      <Link href={href(`/actions/${batch.protocol.traceId}`)} className="shrink-0 text-[11px] font-semibold text-[#2E5BFF]">
                        View
                      </Link>
                    ) : (
                      <span className="shrink-0 text-[11px] text-[#94A3B8]">Locked</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D8DEE9] bg-white px-6 py-3">
        <p className="text-[12px] text-[#64748B]">
          {step.label}
          <span className="mx-1.5 text-[#D8DEE9]">·</span>
          {batch.batchNumber}
        </p>
        <div className="flex gap-2">
          {bs === 'pending' ? (
            <>
              <button
                type="button"
                onClick={reject}
                className="h-9 border border-[#D8DEE9] bg-white px-4 text-[12px] font-semibold text-[#C2413B] hover:bg-[#FEF2F2]"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={approve}
                className="h-9 bg-[#0B1324] px-4 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Authorize as {firstAppr?.role}
              </button>
            </>
          ) : bs === 'authorized' ? (
            <Link
              href={href(`/actions/${batch.protocol.traceId}`)}
              className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Open PAC
            </Link>
          ) : (
            <span className="text-[12px] font-semibold text-[#C2413B]">Rejected</span>
          )}
        </div>
      </div>
    </div>
  )
}
