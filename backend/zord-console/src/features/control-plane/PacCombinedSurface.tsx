'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import { CopyChip } from './ProtocolChrome'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { WorkflowStepper } from './WorkflowStepper'
import { Glyph } from '@/features/payout-command/shared'
import type { GlyphName } from '@/services/payout-command/model'
import PAC_MOCK from '@/data/pac-mock.json'
import { undersettleBreakdownForPayee } from '@/services/payout-command/demo/undersettleScheduleDemo'
import { UndersettleNetPanel } from '@/features/payout-command/shared/UndersettleNetPanel'

function fmtInr(minor: number) {
  return (minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
}

const AUTH_CHAIN = ['org', 'controller', 'cfo', 'agent', 'proposal', 'policy', 'pac'] as const
const KIND_META: Record<string, string> = {
  enterprise_root: 'Enterprise root',
  human: 'Human approver',
  agent: 'Agent workload',
  proposal: 'Action proposal',
  policy: 'Policy decision',
  pac: 'PAC',
}

function Badge({ tone, children }: { tone: 'green' | 'purple' | 'blue'; children: React.ReactNode }) {
  const cls = tone === 'green' ? 'bg-[#E7F6F0] text-[#138A63]' : tone === 'purple' ? 'bg-[#F3E8FF] text-[#6D4AFF]' : 'bg-[#E8EEFF] text-[#2E5BFF]'
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-[9px] font-semibold uppercase tracking-[0.04em] ${cls}`}>{children}</span>
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">{label}</p>
      <p className={`mt-px truncate text-[12px] font-semibold text-[#0B1324] ${mono ? 'font-mono text-[10px]' : ''}`}>{value || '—'}</p>
    </div>
  )
}

type TabId = 'proposal' | 'policy' | 'approval' | 'agent-policy' | 'authority' | 'contract' | 'sealed'

const TABS: { id: TabId; label: string; icon: GlyphName; badge: string }[] = [
  { id: 'proposal', label: 'Proposal', icon: 'document', badge: 'PROPOSED' },
  { id: 'policy', label: 'Policy', icon: 'shield', badge: 'ALLOW' },
  { id: 'approval', label: 'Approval', icon: 'check', badge: 'COMPLETE' },
  { id: 'agent-policy', label: 'Agent + Policy', icon: 'users', badge: 'ATTACHED' },
  { id: 'authority', label: 'Authority', icon: 'key', badge: 'VERIFIED' },
  { id: 'contract', label: 'PAC', icon: 'lock', badge: 'SEALED' },
  { id: 'sealed', label: 'Summary', icon: 'zap', badge: 'DONE' },
]

export function PacCombinedSurface({ traceId, focusSection }: { traceId?: string; focusSection?: string }) {
  return (
    <UploadGate title="No payment obligations yet">
      <PacBody traceId={traceId} focusSection={focusSection} />
    </UploadGate>
  )
}

function PacBody({ traceId, focusSection }: { traceId?: string; focusSection?: string }) {
  const activeTrace = traceId?.trim() || CROSS_BORDER_TRACE_ID
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)

  const data = useMemo(() => PAC_MOCK.proposal, [])
  const authData = useMemo(() => PAC_MOCK.authority, [])
  const pac = useMemo(() => PAC_MOCK.contract, [])

  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('proposal')
  const [jsonOpen, setJsonOpen] = useState(false)

  const instructions = useMemo(() => {
    return data.payment_instructions.map((row) => ({
      id: row.human_ref,
      amount_minor: Math.round(row.amount_rupees * 100),
      currency: row.currency,
      vendor: row.beneficiary,
      rail: row.rail,
    }))
  }, [data])

  const active = instructions.find((r) => r.id === selectedRef) ?? instructions[0] ?? null
  const batchTotal = data.batch.intended_display ?? fmtInr(instructions.reduce((s, r) => s + r.amount_minor, 0))

  const chain = useMemo(() => {
    if (!authData.nodes) return []
    const byId = new Map(authData.nodes.map((n: any) => [n.id, n]))
    return AUTH_CHAIN.map((id) => byId.get(id)).filter(Boolean) as any[]
  }, [authData])

  const demo = authData.demo
  const amountLabel = demo.amount_display
  const beneficiary = demo.beneficiary
  const humanRef = demo.human_ref
  const pacId = pac.pac_id
  const controls = data.attached_structure?.control_labels ?? []
  const selectedBreakdown = undersettleBreakdownForPayee(
    active?.vendor,
    active ? active.amount_minor / 100 : undefined,
  )

  return (
    <div className="flex min-h-full flex-col bg-[#F7F8FB]">
      <WorkflowStepper
        activeStep={focusSection === 'authority' ? 'authority' : focusSection === 'contract' ? 'contract' : 'action'}
        traceId={activeTrace}
        context={active ? { batch: 'Batch 001', action: active.id, beneficiary: active.vendor, amount: fmtInr(active.amount_minor), rail: active.rail } : undefined}
      />

      {/* HEADER */}
      <header className="border-b border-[#D8DEE9] bg-white px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">SANDBOX · CROSS BORDER · BATCH 001</p>
            <h1 className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-[#0B1324]">Payment Action Contract</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <Badge key={t.id} tone={tab === t.id ? 'blue' : 'green'}>{t.badge}</Badge>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#64748B]">
          <span className="font-semibold text-[#0B1324]">{humanRef}</span>
          <span>·</span><span>{beneficiary}</span>
          <span>·</span><span className="font-semibold text-[#0B1324]">{amountLabel}</span>
          <span>·</span><span>{demo.rail}</span>
          <span>·</span><span>Batch 001 · {instructions.length} actions · {batchTotal}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* LEFT: payment list */}
        <div className="w-full shrink-0 border-r border-[#D8DEE9] bg-white lg:w-[280px]">
          <div className="sticky top-0 border-b border-[#EEF2F6] bg-[#FAFBFC] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Actions ({instructions.length})</p>
          </div>
          <ul className="max-h-[calc(100vh-200px)] divide-y divide-[#EEF2F6] overflow-y-auto">
            {instructions.map((row) => {
              const sel = (active?.id ?? '') === row.id
              return (
                <li key={row.id}>
                  <button type="button" onClick={() => setSelectedRef(row.id)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${sel ? 'bg-[#F1F5F9] border-l-2 border-l-[#2E5BFF]' : 'hover:bg-[#F8FAFC] border-l-2 border-l-transparent'}`}>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-[#0B1324]">{row.id}</p>
                      <p className="truncate text-[10px] text-[#94A3B8]">{row.vendor}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-semibold tabular-nums text-[#0B1324]">{fmtInr(row.amount_minor)}</p>
                      <p className="text-[9px] text-[#94A3B8]">{row.rail}</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* RIGHT: tabbed content */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {/* Tab bar */}
          <div className="sticky top-0 z-10 flex border-b border-[#D8DEE9] bg-white">
            {TABS.map((t) => {
              const activeTab = tab === t.id
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-center text-[11px] font-semibold transition border-b-2 ${activeTab ? 'border-[#2E5BFF] text-[#0B1324] bg-[#F5F7FF]' : 'border-transparent text-[#94A3B8] hover:text-[#64748B] hover:bg-[#FAFBFC]'}`}>
                  <Glyph name={t.icon} className={`h-3.5 w-3.5 ${activeTab ? 'text-[#2E5BFF]' : 'text-[#94A3B8]'}`} />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-4">

            {/* ACTION PROPOSAL */}
            {tab === 'proposal' && (
              <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Action Proposal</h2>
                  <Badge tone="purple">AGENT PROPOSED</Badge>
                </div>
                <div className="mt-3 rounded-md border border-[#E8EDF5] bg-[#F7F8FB] px-3 py-2">
                  <p className="text-[13px] font-semibold text-[#0B1324]">{data.agent.purpose}</p>
                  <p className="font-mono text-[10px] text-[#94A3B8]">{data.agent.agent_id}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <KV label="Beneficiary" value={active?.vendor || beneficiary} />
                  <KV label="Amount" value={active ? fmtInr(active.amount_minor) : amountLabel} />
                  <KV label="Rail" value={active?.rail || 'NEFT'} />
                  <KV label="Source" value={`${active?.id || humanRef} / Batch 001`} />
                  <KV label="Batch" value="Batch 001 · 100 instructions" />
                  <KV label="Rationale" value={data.rationale_summary} />
                </div>
                <div className="mt-3 rounded-md border border-l-4 border-l-[#6D4AFF] border-[#D8DEE9] bg-[#F7F8FB] px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-[#6D4AFF]">NOT AUTHORIZED</p>
                  <p className="mt-0.5 text-[11px] text-[#64748B]">Agent output is a proposal, not permission. No funds can be moved from this state.</p>
                </div>
              </div>
            )}

            {/* POLICY DECISION */}
            {tab === 'policy' && (
              <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Policy Decision</h2>
                  <Badge tone="green">ALLOW</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <KV label="Policy" value={data.attached_structure?.policy_label || '—'} />
                  <KV label="Version" value="v14" />
                  <KV label="Namespace" value={data.attached_structure?.status || 'ATTACHED'} />
                  <KV label="Currency" value={data.attached_structure?.settlement_currency || 'INR'} />
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Rules Evaluated</p>
                  <div className="mt-1.5 grid grid-cols-1 gap-1">
                    {['Source rule', 'Currency rule', 'Rail rule', 'Beneficiary rule', 'Approval threshold', 'Incomplete-order net (A, B, C)', 'Withholding-tax line', 'Commercial margin holdback'].map((r) => (
                      <div key={r} className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-[#FAFBFC] px-2.5 py-1.5 text-[12px] text-[#138A63]">
                        <span className="font-bold">✓</span> {r}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <KV label="Decision Receipt" value="pdr_novacell_bch001" mono />
                  <KV label="Policy Hash" value={data.attached_structure?.digest || 'sha256:...'} mono />
                  <KV label="Input Hash" value="sha256:input-bch001" mono />
                  <KV label="Decision" value="ALLOW — all rules satisfied" />
                </div>
              </div>
            )}

            {/* HUMAN APPROVAL */}
            {tab === 'approval' && (
              <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Human Approval</h2>
                  <Badge tone="green">COMPLETE</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {[{ role: 'Treasury Controller', name: 'A. Keller', perm: 'approve.payout.domestic', at: '2026-09-01 11:21 IST' }, { role: 'CFO', name: 'M. Duarte', perm: 'approve.payout.domestic.step_up', at: '2026-09-01 11:21 IST' }].map((a) => (
                    <div key={a.role} className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-[#0B1324]">{a.role}</p>
                          <p className="text-[11px] text-[#64748B]">{a.name}</p>
                        </div>
                        <span className="inline-flex h-6 items-center rounded-full bg-[#E7F6F0] px-2.5 text-[10px] font-semibold text-[#138A63]">APPROVED</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div><span className="text-[#94A3B8]">Permission:</span> <span className="font-mono font-semibold">{a.perm}</span></div>
                        <div><span className="text-[#94A3B8]">Signed at:</span> <span className="font-semibold">{a.at}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-[#E7F6F0] bg-[#F0FDF9] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-semibold text-[#0B1324]">Separation of Duties</p>
                      <p className="text-[10px] text-[#64748B]">Different approvers required for controller and CFO roles</p>
                    </div>
                    <span className="text-[11px] font-semibold text-[#138A63]">SATISFIED</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <KV label="Authentication" value="Step-up / Passkey" />
                  <KV label="Required Approvals" value="2 of 2 completed" />
                </div>
              </div>
            )}

            {/* AGENT + POLICY */}
            {tab === 'agent-policy' && (
              <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Agent + Attached Policy</h2>
                  <Badge tone="green">ATTACHED</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Agent</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#0B1324]">{data.agent.purpose}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[#94A3B8]">{data.agent.agent_id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Policy</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#0B1324]">{data.attached_structure?.policy_label}</p>
                    <p className="mt-0.5 text-[10px] text-[#94A3B8]">Structure: {data.attached_structure?.structure_id}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <KV label="Capability" value="Supplier payout only" />
                  <KV label="Ceiling" value={fmtInr(data.agent.max_amount_per_action.amount_minor)} />
                  <KV label="Settlement" value={data.attached_structure?.settlement_currency || 'INR'} />
                  <KV label="Approved Rails" value={data.attached_structure?.approved_rails.join(' · ') || '—'} />
                  <KV label="Controls" value={`${controls.length} rules`} />
                  <KV label="Status" value={data.attached_structure?.status || 'ATTACHED'} />
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Policy Controls</p>
                  <div className="mt-1.5 space-y-1">
                    {controls.map((label: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-[#FAFBFC] px-2.5 py-1.5 text-[12px] text-[#0B1324]">
                        <span className="text-[#138A63] font-bold">✓</span> {label}
                      </div>
                    ))}
                  </div>
                </div>
                {data.attached_structure?.business_note ? (
                  <div className="mt-3 rounded-md border border-[#D8DEE9] bg-[#F7F8FB] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Business Note</p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">{data.attached_structure.business_note}</p>
                  </div>
                ) : null}
              </div>
            )}

            {/* AUTHORITY */}
            {tab === 'authority' && (
              <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Authority Chain</h2>
                  <Badge tone="green">VERIFIED</Badge>
                </div>
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {chain.map((node: any, i: number) => {
                      const label = KIND_META[node.kind] ?? 'Unknown'
                      return (
                        <div key={node.id} className="flex items-center">
                          {i > 0 ? <span className="mx-1 text-[12px] text-[#C5CDD9]">→</span> : null}
                          <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] px-3 py-2 text-center shadow-sm">
                            <p className="text-[12px] font-semibold text-[#0B1324]">{node.label}</p>
                            <p className="text-[9px] text-[#94A3B8]">{label}</p>
                            <span className="mt-0.5 inline-flex h-4 items-center rounded-full bg-[#E7F6F0] px-1.5 text-[8px] font-bold text-[#138A63]">✓</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Verification Checks</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {['Organization root verified', 'Delegation chain valid', 'Agent credential active', 'Agent capability in scope', 'Action scope authorized'].map((c) => (
                      <div key={c} className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-[#FAFBFC] px-2.5 py-1.5 text-[11px] text-[#138A63]">
                        <span className="font-bold">✓</span> {c}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <KV label="Enterprise Root" value="Zordnet Operations" />
                  <KV label="Delegating Role" value="Treasury Controller" />
                  <KV label="Agent" value={data.agent.agent_id} />
                </div>
              </div>
            )}

            {/* PAC CONTRACT */}
            {tab === 'contract' && (
              <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Payment Action Contract</h2>
                  <Badge tone="green">SEALED</Badge>
                </div>
                <div className="mt-2 rounded-md border border-[#E7F6F0] bg-[#F0FDF9] px-3 py-2">
                  <p className="text-[13px] font-semibold text-[#0B1324]">Pay {amountLabel} to {beneficiary} against {humanRef} / Batch 001</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <KV label="Principal" value={demo.debtor} />
                  <KV label="Actor" value={pac.actor.agent_id} />
                  <KV label="Beneficiary" value={active?.vendor || beneficiary} />
                  <KV label="Invoice" value={active ? fmtInr(active.amount_minor) : amountLabel} />
                  <KV label="Rail" value={active?.rail || demo.rail} />
                  <KV label="Policy" value={`${data.attached_structure?.policy_label} · v14`} />
                </div>
                {selectedBreakdown ? (
                  <div className="mt-3">
                    <UndersettleNetPanel breakdown={selectedBreakdown} mode="contract" />
                  </div>
                ) : null}
                <div className="mt-3 rounded-lg border border-[#D8DEE9] bg-[#FAFBFC] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">Contract Integrity</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <KV label="PAC ID" value={pacId} mono />
                    <KV label="Trace" value={pac.trace_id} mono />
                    <KV label="Digest" value={pac.digest} mono />
                    <KV label="Signing Key" value={pac.signature.kid} mono />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-[#138A63]">
                    <span>✓</span> JWS ES256 · Signature Verified
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" className="inline-flex h-8 items-center rounded border border-[#D8DEE9] bg-white px-2.5 text-[11px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]">Verify</button>
                  <button type="button" onClick={() => setJsonOpen((v) => !v)} className="inline-flex h-8 items-center rounded border border-[#D8DEE9] bg-white px-2.5 text-[11px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]">JSON</button>
                  <Link href={href(`/actions/${activeTrace}/dispatch`)} className="inline-flex h-8 items-center rounded bg-[#0B1324] px-3 text-[11px] font-semibold text-white hover:bg-[#1E293B]">Dispatch →</Link>
                </div>
                {jsonOpen ? (
                  <pre className="mt-3 max-h-[300px] overflow-auto rounded border border-[#D8DEE9] bg-[#0B1324] p-3 font-mono text-[10px] leading-relaxed text-[#E2E8F0]">
                    {JSON.stringify(pac, null, 2)}
                  </pre>
                ) : null}
              </div>
            )}

            {/* SUMMARY */}
            {tab === 'sealed' && (
              <div className="rounded-lg border border-[#E7F6F0] bg-[#F0FDF9] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[14px] font-semibold text-[#138A63]">PAC SEALED</h2>
                    <p className="mt-0.5 text-[12px] text-[#64748B]">Authority verified · Policy allowed · Approvals complete · Signature verified</p>
                  </div>
                  <Badge tone="green">COMPLETE</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <KV label="Action" value={`${humanRef} → ${beneficiary}`} />
                  <KV label="Amount" value={`${amountLabel} ${demo.rail}`} />
                  <KV label="Policy" value={`${data.attached_structure?.policy_label} v14`} />
                  <KV label="Agent" value={data.agent.agent_id} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Proposal', status: 'Created' },
                    { label: 'Authority', status: 'Verified' },
                    { label: 'Policy', status: 'Allow' },
                    { label: 'Approval', status: '2/2' },
                    { label: 'Signature', status: 'Verified' },
                    { label: 'PAC ID', status: pacId },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-center">
                      <p className="text-[10px] font-semibold uppercase text-[#94A3B8]">{s.label}</p>
                      <p className={`text-[12px] font-semibold ${s.label === 'PAC ID' ? 'font-mono text-[10px] text-[#0B1324]' : 'text-[#138A63]'}`}>{s.status}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyChip label="PAC" value={pacId} />
                  <CopyChip label="Trace" value={activeTrace} />
                  <Link href={href(`/actions/${activeTrace}/dispatch`)} className="inline-flex h-8 items-center rounded bg-[#0B1324] px-3 text-[11px] font-semibold text-white hover:bg-[#1E293B]">Dispatch Control →</Link>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
