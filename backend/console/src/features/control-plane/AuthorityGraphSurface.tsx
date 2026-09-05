'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchAuthority } from '@/services/protocol/controlPlaneClient'
import {
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import {
  CopyChip,
  EvidenceChip,
  PageState,
  ProtocolJsonPanel,
  copyText,
} from './ProtocolChrome'
import { ActionTraceSidebar } from './ActionTraceSidebar'
import { FlowCompletionPopup } from './FlowCompletionPopup'
import { useProtocolQuery } from './useProtocolQuery'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { WorkflowStepper, WorkflowNavButtons } from './WorkflowStepper'
import type { ProtocolObject } from '@/types/protocol'

type AuthorityNode = {
  id: string
  label: string
  kind: string
  credential?: ProtocolObject
  object?: ProtocolObject
}

/** Straight vertical authority chain for the sealed payout. */
const CHAIN_ORDER = ['org', 'controller', 'cfo', 'agent', 'proposal', 'policy', 'pac'] as const

const KIND_META: Record<
  string,
  { title: string; accent: string; bar: string; badge: string }
> = {
  enterprise_root: {
    title: 'Enterprise root',
    accent: 'bg-[#0B1324] text-white',
    bar: 'border-t-[#0B1324]',
    badge: 'bg-[#EEF2F6] text-[#0B1324]',
  },
  human: {
    title: 'Human approver',
    accent: 'bg-[#E8EEFF] text-[#2E5BFF]',
    bar: 'border-t-[#2E5BFF]',
    badge: 'bg-[#E8EEFF] text-[#2E5BFF]',
  },
  agent: {
    title: 'Agent workload',
    accent: 'bg-[#F3E8FF] text-[#6D4AFF]',
    bar: 'border-t-[#6D4AFF]',
    badge: 'bg-[#F3E8FF] text-[#6D4AFF]',
  },
  proposal: {
    title: 'Action proposal',
    accent: 'bg-[#F1F5F9] text-[#64748B]',
    bar: 'border-t-[#94A3B8]',
    badge: 'bg-[#F1F5F9] text-[#64748B]',
  },
  policy: {
    title: 'Policy decision',
    accent: 'bg-[#E7F6F0] text-[#138A63]',
    bar: 'border-t-[#138A63]',
    badge: 'bg-[#E7F6F0] text-[#138A63]',
  },
  pac: {
    title: 'Payment Action Contract',
    accent: 'bg-[#E8EEFF] text-[#2E5BFF]',
    bar: 'border-t-[#2E5BFF]',
    badge: 'bg-[#E8EEFF] text-[#2E5BFF]',
  },
}

function formatInrFromMinor(minor: number) {
  return (minor / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  })
}

function nodeSubtitle(node: AuthorityNode): string {
  const cred = node.credential
  const obj = node.object
  if (cred) {
    const scope = String(cred.scope ?? '')
    const subject = cred.subject as { name?: string; type?: string; id?: string } | undefined
    if (subject?.name) return `${subject.name} · ${scope || 'scoped'}`
    if (scope) return scope
    return String(cred.credential_id ?? node.kind)
  }
  if (obj) {
    if (node.kind === 'policy') {
      return `Decision ${String(obj.decision ?? '—')} · ${String(obj.policy_version ?? '')}`
    }
    if (node.kind === 'pac') return `PAC ${String(obj.pac_id ?? '').slice(0, 22)}…`
    if (node.kind === 'proposal') {
      return `Proposal ${String(obj.proposal_id ?? obj.action_proposal_id ?? 'bound')}`
    }
  }
  return node.kind
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E8EDF5] bg-[#F7F8FB] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">{label}</p>
      <p className="mt-0.5 break-all font-mono text-[11px] text-[#0B1324]">{value || '—'}</p>
    </div>
  )
}

export function AuthorityGraphSurface({ traceId }: { traceId: string }) {
  return (
    <UploadGate title="No payment obligations yet">
      <AuthorityGraphBody traceId={traceId} />
    </UploadGate>
  )
}

function AuthorityGraphBody({ traceId }: { traceId: string }) {
  const activeTrace = traceId?.trim() || CROSS_BORDER_TRACE_ID
  const { data, error, loading } = useProtocolQuery(`authority:${activeTrace}`, () =>
    fetchAuthority(activeTrace),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'node' | 'protocol'>('node')
  const [authPopupOpen, setAuthPopupOpen] = useState(false)
  const [authPopupShown, setAuthPopupShown] = useState(false)
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)

  const chain = useMemo(() => {
    if (!data?.nodes) return [] as AuthorityNode[]
    const byId = new Map(data.nodes.map((n) => [n.id, n]))
    const ordered = CHAIN_ORDER.map((id) => byId.get(id)).filter(Boolean) as AuthorityNode[]
    for (const n of data.nodes) {
      if (!CHAIN_ORDER.includes(n.id as (typeof CHAIN_ORDER)[number])) ordered.push(n)
    }
    return ordered
  }, [data])

  // Show popup once authority chain loads
  useEffect(() => {
    if (data?.nodes?.length && !authPopupShown) {
      const t = window.setTimeout(() => {
        setAuthPopupOpen(true)
        setAuthPopupShown(true)
      }, 2000)
      return () => window.clearTimeout(t)
    }
  }, [data?.nodes?.length, authPopupShown])

  const selected =
    chain.find((n) => n.id === selectedId) ?? chain.find((n) => n.id === 'pac') ?? chain[0] ?? null

  const demo = data?.demo
  const batch = data?.batch_totals
  const amountLabel =
    demo?.amount_display ??
    (demo?.amount_minor != null ? formatInrFromMinor(demo.amount_minor) : '—')
  const batchLabel = batch?.intended_display ?? '₹1,23,77,867.56'
  const policyDecision = String(
    chain.find((n) => n.id === 'policy')?.object?.decision ?? 'ALLOW',
  )

  return (
    <div className="flex min-h-full flex-col bg-[#F7F8FB]">
      <WorkflowStepper
        activeStep="authority"
        traceId={activeTrace}
        context={demo ? {
          batch: 'Batch 001',
          action: demo.human_ref,
          beneficiary: demo.beneficiary,
          amount: amountLabel,
          rail: demo.rail,
        } : undefined}
      />
      <header className="border-b border-[#D8DEE9] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              Sandbox · Batch 001 · {demo?.debtor || 'Zordnet Operations'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0B1324]">
                Authority chain
                {demo?.human_ref ? (
                  <span className="ml-2 text-[18px] font-semibold text-[#64748B]">
                    · {demo.human_ref}
                  </span>
                ) : null}
              </h1>
              <EvidenceChip kind="verified">Source attestation verified</EvidenceChip>
              <EvidenceChip kind="deterministic">Dual approval</EvidenceChip>
              <EvidenceChip kind="deterministic">
                {`${batch?.intent_count ?? 20} instructions · ${batchLabel}`}
              </EvidenceChip>
            </div>
            <p className="mt-1 max-w-[760px] text-[13px] text-[#64748B]">
              Whose authority this agent carries for each Batch 001 payout — org root, human approvers,
              agent credential, policy receipt, then sealed Payment Action Contract. Select an
              instruction in the list; amounts match Intent Journal (₹1,23,77,867.56 total).
            </p>
            {demo ? (
              <p className="mt-2 text-[13px] text-[#0B1324]">
                <span className="font-semibold">{demo.human_ref}</span>
                <span className="mx-1.5 text-[#CBD5E1]">·</span>
                {demo.beneficiary}
                <span className="mx-1.5 text-[#CBD5E1]">·</span>
                <span className="font-semibold tabular-nums">{amountLabel}</span>
                <span className="mx-1.5 text-[#CBD5E1]">·</span>
                {demo.rail}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={href(`/actions/${activeTrace}/lifecycle`)}
              className="inline-flex h-9 items-center rounded-md border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324]"
            >
              Open lifecycle
            </Link>
            <Link
              href={href(`/actions/${activeTrace}/contract`)}
              className="inline-flex h-9 items-center rounded-md bg-[#2E5BFF] px-3 text-[12px] font-semibold text-white hover:bg-[#2448D6]"
            >
              Open contract
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ActionTraceSidebar activeTraceId={activeTrace} mode="authority" />
        <div className="min-w-0 flex-1">
          <PageState loading={loading} error={error}>
            {data ? (
              <>
                <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div
                    className="relative overflow-auto border-r border-[#D8DEE9] px-6 py-8"
                    style={{
                      backgroundImage: 'radial-gradient(circle, #D8DEE9 1px, transparent 1px)',
                      backgroundSize: '18px 18px',
                      backgroundColor: '#F7F8FB',
                    }}
                  >
                    <div className="mx-auto mb-4 w-full max-w-[420px] rounded-xl border border-[#D8DEE9] bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                        Authority for this payout
                      </p>
                      <p className="mt-1 text-[14px] font-semibold text-[#0B1324]">
                        {demo?.human_ref || '—'} · {amountLabel}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">
                        {demo?.beneficiary || '—'} · batch total {batchLabel}
                      </p>
                    </div>
                    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center">
                      {chain.map((node, i) => {
                        const meta = KIND_META[node.kind] ?? KIND_META.proposal
                        const active = selected?.id === node.id
                        return (
                          <div key={node.id} className="flex w-full flex-col items-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(node.id)
                                setSidebarTab('node')
                              }}
                              className={`w-full rounded-xl border border-[#D8DEE9] border-t-[3px] bg-white p-4 text-left shadow-[0_1px_2px_rgba(11,19,36,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(11,19,36,0.08)] ${meta.bar} ${
                                active ? 'ring-2 ring-[#2E5BFF]/35' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span
                                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold ${meta.accent}`}
                                >
                                  {i + 1}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em] ${meta.badge}`}
                                >
                                  {meta.title}
                                </span>
                              </div>
                              <p className="mt-3 text-[14px] font-semibold text-[#0B1324]">{node.label}</p>
                              <p className="mt-1 text-[12px] text-[#64748B]">{nodeSubtitle(node)}</p>
                              <p className="mt-2 text-[11px] font-semibold text-[#138A63]">
                                Verified at signing time
                              </p>
                            </button>

                            {i < chain.length - 1 ? (
                              <div className="flex flex-col items-center py-1" aria-hidden>
                                <span className="h-6 w-px bg-[#C5CDD9]" />
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#D8DEE9] bg-white text-[12px] font-semibold text-[#94A3B8]">
                                  ↓
                                </span>
                                <span className="h-6 w-px bg-[#C5CDD9]" />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <aside className="flex flex-col bg-white">
                    <div className="border-b border-[#D8DEE9] px-4 py-3">
                      {selected ? (
                        <div className="flex items-start gap-3">
                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${
                              (KIND_META[selected.kind] ?? KIND_META.proposal).accent
                            }`}
                          >
                            {(CHAIN_ORDER as readonly string[]).indexOf(selected.id) + 1 || '·'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-[#0B1324]">{selected.label}</p>
                            <p className="mt-0.5 text-[11px] text-[#64748B]">
                              {(KIND_META[selected.kind] ?? KIND_META.proposal).title}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] text-[#64748B]">Select a node</p>
                      )}
                    </div>

                    <div className="flex border-b border-[#D8DEE9]">
                      <button
                        type="button"
                        onClick={() => setSidebarTab('node')}
                        className={`flex-1 px-3 py-2.5 text-[12px] font-semibold ${
                          sidebarTab === 'node'
                            ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                            : 'text-[#64748B]'
                        }`}
                      >
                        Node
                      </button>
                      <button
                        type="button"
                        onClick={() => setSidebarTab('protocol')}
                        className={`flex-1 px-3 py-2.5 text-[12px] font-semibold ${
                          sidebarTab === 'protocol'
                            ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                            : 'text-[#64748B]'
                        }`}
                      >
                        Protocol
                      </button>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                      {selected && sidebarTab === 'node' ? (
                        <>
                          <div className="rounded-lg border border-[#E2E8F0] bg-[#F7F8FB] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                              Payout under review
                            </p>
                            <p className="mt-1 text-[13px] font-semibold text-[#0B1324]">
                              {demo?.human_ref} · {amountLabel}
                            </p>
                            <p className="text-[11px] text-[#64748B]">{demo?.beneficiary}</p>
                          </div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                            Authority details
                          </p>
                          {selected.credential ? (
                            <div className="space-y-2">
                              <Field
                                label="Credential ID"
                                value={String(selected.credential.credential_id ?? '')}
                              />
                              <Field
                                label="Kind"
                                value={String(selected.credential.kind ?? selected.kind)}
                              />
                              <Field label="Scope" value={String(selected.credential.scope ?? '')} />
                              <Field
                                label="Key thumbprint"
                                value={String(selected.credential.key_thumbprint ?? '')}
                              />
                              <Field
                                label="Revocation"
                                value={String(selected.credential.revocation_status ?? 'active')}
                              />
                              <Field
                                label="Issued"
                                value={String(selected.credential.issued_at ?? '')}
                              />
                              <Field
                                label="Expires"
                                value={String(selected.credential.expires_at ?? '')}
                              />
                            </div>
                          ) : selected.object ? (
                            <div className="space-y-2">
                              {selected.kind === 'policy' ? (
                                <>
                                  <Field
                                    label="Decision"
                                    value={String(selected.object.decision ?? '')}
                                  />
                                  <Field
                                    label="Policy"
                                    value={`${String(selected.object.policy_id ?? '')} @ ${String(selected.object.policy_version ?? '')}`}
                                  />
                                  <Field
                                    label="Obligations"
                                    value={
                                      Array.isArray(selected.object.obligations)
                                        ? selected.object.obligations.join(', ')
                                        : ''
                                    }
                                  />
                                  <Field
                                    label="AI role"
                                    value={String(
                                      selected.object.ai_role ??
                                        'none — advisory only if drafted',
                                    )}
                                  />
                                </>
                              ) : null}
                              {selected.kind === 'pac' ? (
                                <>
                                  <Field
                                    label="PAC ID"
                                    value={String(selected.object.pac_id ?? '')}
                                  />
                                  <Field
                                    label="Trace"
                                    value={String(selected.object.trace_id ?? '')}
                                  />
                                  <Field label="Amount" value={amountLabel} />
                                  <Field
                                    label="Beneficiary"
                                    value={String(
                                      (
                                        selected.object.action as
                                          | { beneficiary_ref?: string }
                                          | undefined
                                      )?.beneficiary_ref ??
                                        demo?.beneficiary ??
                                        '',
                                    )}
                                  />
                                  <Field
                                    label="Environment"
                                    value={String(selected.object.environment ?? 'SANDBOX')}
                                  />
                                </>
                              ) : null}
                              {selected.kind === 'proposal' ? (
                                <>
                                  <Field
                                    label="Object"
                                    value={String(
                                      selected.object.proposal_id ??
                                        selected.object.action_proposal_id ??
                                        'ActionProposal',
                                    )}
                                  />
                                  <Field label="Amount" value={amountLabel} />
                                  <Field label="Beneficiary" value={demo?.beneficiary ?? ''} />
                                </>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-[12px] text-[#64748B]">
                              No credential payload on this node.
                            </p>
                          )}

                          {selected.kind === 'proposal' || selected.kind === 'pac' ? (
                            <div className="rounded-lg border border-l-4 border-[#D8DEE9] border-l-[#2E5BFF] bg-[#F7F8FB] px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                                Policy Studio note on protocol
                              </p>
                              <p className="mt-1 text-[12px] text-[#0B1324]">
                                {String(
                                  (
                                    selected.object as {
                                      business_context?: { policy_studio_note?: string }
                                    }
                                  )?.business_context?.policy_studio_note ??
                                    (
                                      selected.object as {
                                        execution_constraints?: { notes?: string }
                                      }
                                    )?.execution_constraints?.notes ??
                                    'No structure attached yet — construct from Policy Studio.',
                                )}
                              </p>
                            </div>
                          ) : null}
                          <div className="pt-2">
                            <p className="text-[11px] text-[#64748B]">
                              Dual approval above ₹50,000. Treasury Controller and CFO signed.
                              Separation of duties holds. Agents never finalize authority alone.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <CopyChip label="Trace" value={data.trace_id} />
                            <CopyChip label="Payout" value={demo?.human_ref || '—'} />
                            {selected.credential?.credential_id ? (
                              <button
                                type="button"
                                className="rounded-md border border-[#D8DEE9] px-2 py-1 text-[11px] font-semibold text-[#2E5BFF]"
                                onClick={() =>
                                  copyText(String(selected.credential?.credential_id))
                                }
                              >
                                Copy credential
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : null}

                      {selected && sidebarTab === 'protocol' ? (
                        <ProtocolJsonPanel
                          object={selected.credential ?? selected.object ?? selected}
                          title={`${selected.label} · protocol`}
                        />
                      ) : null}
                    </div>
                  </aside>
                </div>

                <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#D8DEE9] bg-white px-5 py-3 text-[12px]">
                  <p className="text-[#64748B]">
                    Selected{' '}
                    <span className="font-semibold text-[#0B1324]">
                      {demo?.human_ref || '—'} · {amountLabel}
                    </span>
                  </p>
                  <p className="text-[#64748B]">
                    Batch{' '}
                    <span className="font-semibold text-[#0B1324]">
                      {batch?.intent_count ?? 20} · {batchLabel}
                    </span>
                  </p>
                  <p className="text-[#64748B]">
                    Chain length{' '}
                    <span className="font-semibold text-[#0B1324]">{chain.length} nodes</span>
                  </p>
                  <p className="text-[#64748B]">
                    Policy{' '}
                    <span
                      className={`font-semibold ${
                        policyDecision === 'ALLOW' ? 'text-[#138A63]' : 'text-[#C2413B]'
                      }`}
                    >
                      {policyDecision}
                    </span>
                  </p>
                </footer>
              </>
            ) : null}
          </PageState>
        </div>
      </div>

      <WorkflowNavButtons
        backLabel="Action Desk"
        backHref={href(`/actions/${activeTrace}`)}
        nextLabel="Payment Contract"
        nextHref={href(`/actions/${activeTrace}/contract`)}
      />
      <FlowCompletionPopup
        open={authPopupOpen}
        onClose={() => setAuthPopupOpen(false)}
        title="Authority chain verified"
        description="Enterprise root → role → agent → proposal → policy → PAC. Dual approval confirmed. Separation of duties holds."
        nextLabel="Contract"
        nextHref={href(`/actions/${activeTrace}/contract`)}
        traceId={data?.trace_id}
      />
    </div>
  )
}
