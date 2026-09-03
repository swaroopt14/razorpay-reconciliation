'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchLifecycle, replayLifecycle } from '@/services/protocol/controlPlaneClient'
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
} from './ProtocolChrome'
import { useProtocolQuery } from './useProtocolQuery'
import { ActionTraceSidebar } from './ActionTraceSidebar'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { FlowCompletionPopup } from './FlowCompletionPopup'

type LifecycleNode = {
  id: string
  label: string
  object: string
  state: string
  detail?: string
  stage?: string
}

type ActivityItem = {
  id: string
  title: string
  at: string
  kind: 'verified' | 'deterministic' | 'inferred' | 'blocked' | 'agent'
}

/** Single straight line: Capture → … → Prove */
const NODE_ORDER = [
  'capture',
  'propose',
  'authority',
  'policy',
  'pac',
  'dispatch',
  'observe',
  'derive',
  'prove',
] as const

const NODE_W = 148
const NODE_H = 88
const NODE_GAP = 28
const NODE_Y = 48

const NODE_POS: Record<string, { x: number; y: number }> = Object.fromEntries(
  NODE_ORDER.map((id, i) => [id, { x: 24 + i * (NODE_W + NODE_GAP), y: NODE_Y }]),
)

const LIFECYCLE_PROGRESS: Record<string, number> = {
  DRAFT: 0,
  PROPOSED: 1,
  AWAITING_AUTHORITY: 2,
  AUTHORIZED: 3,
  DISPATCH_READY: 4,
  QUEUED: 4,
  DISPATCHED: 5,
  ACKNOWLEDGED: 6,
  IN_PROCESS: 6,
  SETTLED_PROVISIONAL: 7,
  SETTLED_CONFIRMED: 8,
  FINAL: 8,
}

function nodeProgress(state: string): number {
  return LIFECYCLE_PROGRESS[state] ?? -1
}

function nodeStatus(
  node: LifecycleNode,
  _nodes: LifecycleNode[],
  currentState: string,
): 'completed' | 'current' | 'pending' {
  if (currentState === 'SETTLED_CONFIRMED' || currentState === 'FINAL') return 'completed'
  const currentProg = nodeProgress(currentState)
  const nodeProg = nodeProgress(node.state)
  if (currentProg < 0 || nodeProg < 0) return 'pending'
  if (nodeProg < currentProg) return 'completed'
  if (nodeProg === currentProg) return 'current'
  return 'pending'
}

function StageIcon({ id }: { id: string }) {
  const common = 'h-4 w-4'
  switch (id) {
    case 'capture':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M4 12h10M4 17h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'pac':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'dispatch':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 12h12M12 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'observe':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )
    case 'prove':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.5 12l1.8 1.8L15 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
  }
}

function statusTone(status: 'completed' | 'current' | 'pending') {
  if (status === 'completed') return { badge: 'bg-[#E7F6F0] text-[#138A63]', ring: 'border-[#B7E0CF]', icon: 'bg-[#E7F6F0] text-[#138A63]' }
  if (status === 'current') return { badge: 'bg-[#E8EEFF] text-[#2E5BFF]', ring: 'border-[#2E5BFF]', icon: 'bg-[#E8EEFF] text-[#2E5BFF]' }
  return { badge: 'bg-[#F1F5F9] text-[#64748B]', ring: 'border-[#D8DEE9]', icon: 'bg-[#F1F5F9] text-[#64748B]' }
}

function edgePath(from: string, to: string) {
  const a = NODE_POS[from]
  const b = NODE_POS[to]
  if (!a || !b) return null
  const y = a.y + NODE_H / 2
  const x1 = a.x + NODE_W
  const x2 = b.x
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y} C ${mx} ${y}, ${mx} ${y}, ${x2} ${y}`
}

function EdgePaths({ edges }: { edges: [string, string][] }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {edges.map(([from, to]) => {
        const d = edgePath(from, to)
        if (!d) return null
        return (
          <path
            key={`${from}-${to}`}
            d={d}
            fill="none"
            stroke="#C5CDD9"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

/**
 * Financial Lifecycle Graph — workspace layout inspired by modern flow UIs,
 * remapped to Zord Payment Action Contract semantics (not a recon dashboard).
 */
export function LifecycleGraphSurface({
  traceId,
  embedded = false,
}: {
  traceId: string
  /** Render graph only — used as a tab on Payment Trace. */
  embedded?: boolean
}) {
  const body = <LifecycleGraphBody traceId={traceId} embedded={embedded} />
  if (embedded) return body
  return (
    <UploadGate title="No payment obligations yet">{body}</UploadGate>
  )
}

function LifecycleGraphBody({ traceId, embedded = false }: { traceId: string; embedded?: boolean }) {
  const activeTrace = traceId?.trim() || CROSS_BORDER_TRACE_ID
  const { data, error, loading } = useProtocolQuery(`lifecycle:${activeTrace}`, () =>
    fetchLifecycle(activeTrace),
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [replay, setReplay] = useState<Record<string, unknown> | null>(null)
  const [railTab, setRailTab] = useState<'activity' | 'stats'>('stats')
  const [zoom, setZoom] = useState(1)
  const [lifecyclePopupOpen, setLifecyclePopupOpen] = useState(false)
  const [lifecyclePopupShown, setLifecyclePopupShown] = useState(false)
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)

  // Show popup once lifecycle data loads
  useEffect(() => {
    if (embedded) return
    if (data?.nodes?.length && !lifecyclePopupShown) {
      const t = window.setTimeout(() => {
        setLifecyclePopupOpen(true)
        setLifecyclePopupShown(true)
      }, 2000)
      return () => window.clearTimeout(t)
    }
  }, [data?.nodes?.length, lifecyclePopupShown, embedded])

  const nodes: LifecycleNode[] = data?.nodes ?? []
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selected) ?? nodes.find((n) => n.id === 'pac') ?? nodes[0],
    [nodes, selected],
  )

  const activity = (data?.activity ?? []) as ActivityItem[]
  const humanRef = data?.human_ref ?? '—'
  const debtor = data?.beneficiary ?? '—'
  const counterparty =
    (data as { counterparty?: string } | null)?.counterparty ??
    data?.human_ref ??
    '—'
  const rail = data?.rail ?? '—'
  const intended = data?.intended_value
  const settlement = data?.settlement_value
  const matchLabel =
    (data as { match_label?: string } | null)?.match_label ??
    (settlement ? 'Exact match' : 'Settlement not observed')

  return (
    <div className={`flex min-h-full flex-col ${embedded ? 'bg-transparent' : 'bg-[#F7F8FB]'}`}>
      {embedded ? null : (
      <header className="border-b border-[#D8DEE9] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              Sandbox · Cross border · {debtor} → {counterparty}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0B1324]">
                Payment lifecycle · {humanRef}
              </h1>
              <EvidenceChip kind="verified">{String(data?.current_state ?? 'SETTLED_CONFIRMED')}</EvidenceChip>
              <EvidenceChip kind="deterministic">{rail}</EvidenceChip>
              <EvidenceChip kind="deterministic">
                {`${data?.batch_totals?.intent_count ?? 100} · ${data?.batch_totals?.intended_display ?? '₹1,23,77,867.56'}`}
              </EvidenceChip>
            </div>
            <p className="mt-1 max-w-[720px] text-[13px] text-[#64748B]">
              One derived lifecycle from accepted evidence — obligation → policy → contract → dispatch →
              outcome → proof. Late signals stay visible and cannot silently regress state.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:border-[#2E5BFF]"
              onClick={async () => setReplay(await replayLifecycle(activeTrace))}
            >
              Replay from events
            </button>
            <Link
              href={href(`/actions/${activeTrace}/contract`)}
              className="inline-flex h-9 items-center rounded-md border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324]"
            >
              Open contract
            </Link>
            <Link
              href={href(`/proof/${activeTrace}`)}
              className="inline-flex h-9 items-center rounded-md bg-[#2E5BFF] px-3 text-[12px] font-semibold text-white hover:bg-[#2448D6]"
            >
              Open evidence pack
            </Link>
          </div>
        </div>
      </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {embedded ? null : <ActionTraceSidebar activeTraceId={activeTrace} mode="lifecycle" />}
        <div className="min-w-0 flex-1">
      <PageState loading={loading} error={error}>
        {data ? (
          <div className="grid flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main workspace */}
            <div className="flex min-w-0 flex-col border-r border-[#D8DEE9]">
              {/* Canvas */}
              <div className="relative border-b border-[#D8DEE9] bg-white">
                <div className="flex items-center justify-between border-b border-[#EEF2F6] px-4 py-2.5">
                  <p className="text-[12px] font-semibold text-[#0B1324]">
                    Lifecycle graph
                    <span className="ml-2 font-normal text-[#64748B]">Payment Action Contract as the spine</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Zoom out"
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D8DEE9] text-[#0B1324] hover:bg-[#F7F8FB]"
                      onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))}
                    >
                      −
                    </button>
                    <span className="w-12 text-center font-mono text-[11px] text-[#64748B]">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      aria-label="Zoom in"
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D8DEE9] text-[#0B1324] hover:bg-[#F7F8FB]"
                      onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div
                  className="relative overflow-auto"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, #D8DEE9 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                    backgroundColor: '#F7F8FB',
                  }}
                >
                  <div
                    className="relative origin-top-left transition-transform duration-200"
                    style={{
                      width: 24 + NODE_ORDER.length * (NODE_W + NODE_GAP) + 24,
                      height: NODE_Y + NODE_H + 56,
                      transform: `scale(${zoom})`,
                    }}
                  >
                    <EdgePaths edges={data.edges} />
                    {nodes.map((node) => {
                      const pos = NODE_POS[node.id] ?? { x: 40, y: 40 }
                      const status = nodeStatus(node, nodes, data.current_state)
                      const tone = statusTone(status)
                      const active = selectedNode?.id === node.id
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setSelected(node.id)}
                          className={`absolute rounded-xl border bg-white p-3 text-left shadow-[0_1px_2px_rgba(11,19,36,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(11,19,36,0.08)] ${tone.ring} ${
                            active ? 'ring-2 ring-[#2E5BFF]/30' : ''
                          }`}
                          style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${tone.icon}`}>
                              <StageIcon id={node.id} />
                            </span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${tone.badge}`}>
                              {status === 'completed' ? 'Done' : status === 'current' ? 'Live' : 'Queued'}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-[12px] font-semibold text-[#0B1324]">{node.label}</p>
                          <p className="truncate text-[10px] text-[#64748B]">
                            {node.stage ?? node.object}
                            {node.detail ? ` · ${node.detail}` : ''}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom: stage / transition table */}
              <div className="bg-white px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[14px] font-semibold text-[#0B1324]">Lifecycle stages</h2>
                  <p className="text-[11px] text-[#64748B]">
                    Observed fact, correlation, derived state, and finality stay separate
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[#D8DEE9]">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="border-b border-[#D8DEE9] bg-[#F7F8FB] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                      <tr>
                        <th className="px-3 py-2.5">Stage</th>
                        <th className="px-3 py-2.5">Object</th>
                        <th className="px-3 py-2.5">Lifecycle state</th>
                        <th className="px-3 py-2.5">Detail</th>
                        <th className="px-3 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((node) => {
                        const status = nodeStatus(node, nodes, data.current_state)
                        return (
                          <tr
                            key={node.id}
                            className={`border-b border-[#EEF2F6] last:border-0 ${
                              selectedNode?.id === node.id ? 'bg-[#F5F7FF]' : 'bg-white'
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                className="font-semibold text-[#0B1324] hover:text-[#2E5BFF]"
                                onClick={() => setSelected(node.id)}
                              >
                                {node.label}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-[#64748B]">{node.object}</td>
                            <td className="px-3 py-2.5 font-mono text-[11px]">{node.state}</td>
                            <td className="px-3 py-2.5 text-[#64748B]">{node.detail ?? '—'}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                                  status === 'completed'
                                    ? 'text-[#138A63]'
                                    : status === 'current'
                                      ? 'text-[#2E5BFF]'
                                      : 'text-[#64748B]'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    status === 'completed'
                                      ? 'bg-[#138A63]'
                                      : status === 'current'
                                        ? 'bg-[#2E5BFF]'
                                        : 'bg-[#94A3B8]'
                                  }`}
                                />
                                {status === 'completed' ? 'Complete' : status === 'current' ? 'Current' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedNode ? (
                  <div className="mt-4">
                    <ProtocolJsonPanel
                      object={
                        data.transitions.find((t) => String(t.next_state) === selectedNode.state) ??
                        selectedNode
                      }
                      title={`${selectedNode.label} · protocol`}
                    />
                  </div>
                ) : null}
                {replay ? (
                  <div className="mt-4">
                    <ProtocolJsonPanel object={replay} title="Replay result" />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right inspector */}
            <aside className="flex flex-col bg-white">
              <div className="flex border-b border-[#D8DEE9]">
                <button
                  type="button"
                  onClick={() => setRailTab('stats')}
                  className={`flex-1 px-3 py-3 text-[12px] font-semibold ${
                    railTab === 'stats'
                      ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                      : 'text-[#64748B]'
                  }`}
                >
                  Lifecycle stats
                </button>
                <button
                  type="button"
                  onClick={() => setRailTab('activity')}
                  className={`flex-1 px-3 py-3 text-[12px] font-semibold ${
                    railTab === 'activity'
                      ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                      : 'text-[#64748B]'
                  }`}
                >
                  Activity log
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {railTab === 'stats' ? (
                  <>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                        Overview
                      </p>
                      <div className="mt-2 grid gap-2">
                        <div className="rounded-xl border border-[#D8DEE9] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                            Intended payment value
                          </p>
                          <p className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#0B1324]">
                            {intended
                              ? `${intended.currency} ${Number(intended.amount).toLocaleString(
                                  intended.currency === 'INR' ? 'en-IN' : 'en-GB',
                                )}`
                              : '—'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#D8DEE9] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                            Settlement value observed
                          </p>
                          <p className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#0B1324]">
                            {settlement
                              ? `${settlement.currency} ${Number(settlement.amount).toLocaleString(
                                  settlement.currency === 'INR' ? 'en-IN' : 'en-GB',
                                )}`
                              : '—'}
                          </p>
                          <p
                            className={`mt-0.5 text-[11px] ${
                              matchLabel.toLowerCase().includes('exact')
                                ? 'text-[#138A63]'
                                : matchLabel.toLowerCase().includes('provisional')
                                  ? 'text-[#B7791F]'
                                  : 'text-[#64748B]'
                            }`}
                          >
                            {matchLabel}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#D8DEE9] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                            Evidence coverage
                          </p>
                          <p className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#0B1324]">
                            {Math.round(data.evidence_completeness * 100)}%
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#64748B]">Proof-ready for this payout</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                        Derived lifecycle
                      </p>
                      <div className="mt-2 rounded-xl border border-[#D8DEE9] px-3 py-3">
                        <p className="text-[16px] font-semibold text-[#0B1324]">{data.current_state}</p>
                        <p className="mt-1 text-[11px] text-[#64748B]">
                          State machine {data.state_machine_version}
                        </p>
                        <p className="mt-2 text-[12px] text-[#64748B]">
                          Unresolved contradictions:{' '}
                          {data.unresolved_contradictions?.length
                            ? data.unresolved_contradictions.length
                            : 'none'}
                        </p>
                        <div className="mt-3">
                          <CopyChip label="Trace" value={traceId} />
                        </div>
                      </div>
                    </div>

                    {selectedNode ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                          Selected stage
                        </p>
                        <div className="mt-2 rounded-xl border border-l-4 border-[#D8DEE9] border-l-[#2E5BFF] px-3 py-3">
                          <p className="text-[13px] font-semibold text-[#0B1324]">{selectedNode.label}</p>
                          <p className="mt-1 font-mono text-[11px] text-[#64748B]">{selectedNode.object}</p>
                          <p className="mt-2 text-[12px] text-[#64748B]">{selectedNode.detail}</p>
                          <div className="mt-2">
                            <EvidenceChip kind="deterministic">{selectedNode.state}</EvidenceChip>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Execution log
                    </p>
                    <ul className="mt-3 space-y-0">
                      {(activity.length
                        ? activity
                        : [
                            {
                              id: 'fallback',
                              title: `Lifecycle at ${String(data?.current_state ?? 'unknown')}`,
                              at: 'just now',
                              kind: 'verified' as const,
                            },
                          ]
                      ).map((item, i, arr) => (
                        <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {i < arr.length - 1 ? (
                            <span className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-[#E2E8F0]" />
                          ) : null}
                          <span
                            className={`relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              item.kind === 'verified'
                                ? 'bg-[#138A63]'
                                : item.kind === 'deterministic'
                                  ? 'bg-[#2E5BFF]'
                                  : 'bg-[#B7791F]'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[#0B1324]">{item.title}</p>
                            <p className="mt-0.5 text-[11px] text-[#64748B]">{item.at}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : null}
      </PageState>
        </div>
      </div>

      {embedded ? null : (
      <FlowCompletionPopup
        open={lifecyclePopupOpen}
        onClose={() => setLifecyclePopupOpen(false)}
        title="Lifecycle derived"
        description={`One reproducible lifecycle from accepted evidence. Current state: ${String(data?.current_state ?? 'unknown')}. Late signals cannot regress state.`}
        nextLabel="Settlement"
        nextHref={href('/settlement/journal')}
        traceId={activeTrace}
      />
      )}
    </div>
  )
}
