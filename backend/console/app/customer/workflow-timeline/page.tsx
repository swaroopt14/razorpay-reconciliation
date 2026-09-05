'use client'

import { useEffect, useMemo, useState } from 'react'

type SourceClass = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'FUSION' | 'EVIDENCE'

type TimelineNode = {
  id: string
  label: string
  service: string
  sourceClass: SourceClass
  timestamp: string
  status: 'RECEIVED' | 'CANONICALIZED' | 'TOKENIZED' | 'READY_FOR_RELAY' | 'PENDING' | 'SUCCESS' | 'FINALIZED' | 'CERTIFIED'
  confidence?: number
  ruleIds: string[]
  detail: string
}

type WorkflowScenario = {
  id: string
  name: string
  traceId: string
  contractId: string
  intentId: string
  envelopeId: string
  dispatchId: string
  certificateId: string
  ruleVersion: string
  description: string
  nodes: TimelineNode[]
  pollConfidence: number
  finalityConfidence: number
  finalityAt: string
}

type AugmentedNode = TimelineNode & {
  stepNumber: number
  durationFromPreviousMs: number
}

const workflowScenarios: WorkflowScenario[] = [
  {
    id: 'current_v21',
    name: 'ctr_def456 · v2.1 current',
    traceId: 'trace_uvw321',
    contractId: 'ctr_def456',
    intentId: 'int_xyz789',
    envelopeId: 'env_abc123',
    dispatchId: 'disp_789xyz',
    certificateId: 'cert_123',
    ruleVersion: 'v2.1',
    description: 'Original deterministic decision from the walkthrough document.',
    pollConfidence: 0.8,
    finalityConfidence: 1.0,
    finalityAt: '2026-03-03T09:00:00Z',
    nodes: [
      {
        id: 'raw_ingest',
        label: 'Raw Ingest',
        service: 'edge-vault',
        sourceClass: 'S0',
        timestamp: '2026-03-02T10:15:30Z',
        status: 'RECEIVED',
        ruleIds: ['durable_write_before_ack'],
        detail: 'raw_envelope env_abc123 stored immutably before API 202 ACK.',
      },
      {
        id: 'canonicalize',
        label: 'Canonicalization',
        service: 'intent-engine',
        sourceClass: 'S1',
        timestamp: '2026-03-02T10:15:31Z',
        status: 'CANONICALIZED',
        ruleIds: ['canonical_mapping_v1_2'],
        detail: 'Input normalized to canonical_intents with intent_id int_xyz789.',
      },
      {
        id: 'tokenize',
        label: 'Tokenization',
        service: 'token-enclave',
        sourceClass: 'S1',
        timestamp: '2026-03-02T10:15:33Z',
        status: 'TOKENIZED',
        ruleIds: ['pii_tokenization_policy'],
        detail: 'PII converted into tokens before connector boundary.',
      },
      {
        id: 'dispatch_created',
        label: 'Dispatch Created',
        service: 'relay-outbox',
        sourceClass: 'S1',
        timestamp: '2026-03-02T10:15:35Z',
        status: 'READY_FOR_RELAY',
        ruleIds: ['carrier_l1_l2_injection'],
        detail: 'DispatchCreated event with L1 reference_id and L2 narration carriers.',
      },
      {
        id: 'provider_ack',
        label: 'Provider ACK',
        service: 'razorpayx-connector',
        sourceClass: 'S2',
        timestamp: '2026-03-02T10:15:37Z',
        status: 'PENDING',
        ruleIds: ['attempt_sent', 'provider_acked'],
        detail: 'Provider returned pending with payout_id rp_payout_555.',
      },
      {
        id: 'webhook_s2',
        label: 'Webhook S2',
        service: 'outcome-ingress',
        sourceClass: 'S2',
        timestamp: '2026-03-02T10:20:16Z',
        status: 'SUCCESS',
        confidence: 1.0,
        ruleIds: ['l1_exact_match'],
        detail: 'evt_888 SUCCESS with UTR SBIN123456789 and exact carrier match.',
      },
      {
        id: 'poll_s3',
        label: 'Poll S3',
        service: 'backfill-scheduler',
        sourceClass: 'S3',
        timestamp: '2026-03-02T10:30:00Z',
        status: 'SUCCESS',
        confidence: 0.8,
        ruleIds: ['poll_backfill_cadence'],
        detail: 'evt_889 corroborates provider status through pull signal.',
      },
      {
        id: 'statement_s4',
        label: 'Statement S4',
        service: 'statement-processor',
        sourceClass: 'S4',
        timestamp: '2026-03-03T08:59:40Z',
        status: 'SUCCESS',
        confidence: 1.0,
        ruleIds: ['statement_truth_priority'],
        detail: 'evt_890 confirms same UTR through bank statement ground truth.',
      },
      {
        id: 'fusion_finality',
        label: 'Fusion Decision',
        service: 'fusion-engine',
        sourceClass: 'FUSION',
        timestamp: '2026-03-03T09:00:00Z',
        status: 'FINALIZED',
        confidence: 1.0,
        ruleIds: ['truth_hierarchy_v2', 'r1_utr_wins'],
        detail: 'Final state set to SUCCESS using S4 > S2 > S3 hierarchy.',
      },
      {
        id: 'certificate',
        label: 'Certificate',
        service: 'evidence-service',
        sourceClass: 'EVIDENCE',
        timestamp: '2026-03-03T09:00:01Z',
        status: 'CERTIFIED',
        ruleIds: ['certificate_signature_v1'],
        detail: 'Finality certificate cert_123 signed and evidence pack materialized.',
      },
    ],
  },
  {
    id: 'replay_v22',
    name: 'ctr_def456 · v2.2 replay',
    traceId: 'trace_uvw321',
    contractId: 'ctr_def456',
    intentId: 'int_xyz789',
    envelopeId: 'env_abc123',
    dispatchId: 'disp_789xyz',
    certificateId: 'cert_123_replay',
    ruleVersion: 'v2.2 (replay)',
    description: 'Replay run with stronger UTR weighting; finality reached 30 minutes earlier.',
    pollConfidence: 0.92,
    finalityConfidence: 1.0,
    finalityAt: '2026-03-03T08:30:00Z',
    nodes: [
      {
        id: 'raw_ingest',
        label: 'Raw Ingest',
        service: 'edge-vault',
        sourceClass: 'S0',
        timestamp: '2026-03-02T10:15:30Z',
        status: 'RECEIVED',
        ruleIds: ['durable_write_before_ack'],
        detail: 'Replay reads immutable raw envelope env_abc123.',
      },
      {
        id: 'canonicalize',
        label: 'Canonicalization',
        service: 'intent-engine',
        sourceClass: 'S1',
        timestamp: '2026-03-02T10:15:31Z',
        status: 'CANONICALIZED',
        ruleIds: ['canonical_mapping_v1_2'],
        detail: 'Same canonical intent recovered for deterministic re-run.',
      },
      {
        id: 'tokenize',
        label: 'Tokenization',
        service: 'token-enclave',
        sourceClass: 'S1',
        timestamp: '2026-03-02T10:15:33Z',
        status: 'TOKENIZED',
        ruleIds: ['pii_tokenization_policy'],
        detail: 'Tokenized references reused; no plaintext PII exposed.',
      },
      {
        id: 'dispatch_created',
        label: 'Dispatch Created',
        service: 'relay-outbox',
        sourceClass: 'S1',
        timestamp: '2026-03-02T10:15:35Z',
        status: 'READY_FOR_RELAY',
        ruleIds: ['carrier_l1_l2_injection'],
        detail: 'Dispatch metadata replayed from existing event history.',
      },
      {
        id: 'provider_ack',
        label: 'Provider ACK',
        service: 'razorpayx-connector',
        sourceClass: 'S2',
        timestamp: '2026-03-02T10:15:37Z',
        status: 'PENDING',
        ruleIds: ['attempt_sent', 'provider_acked'],
        detail: 'ACK remains pending at provider boundary in replay.',
      },
      {
        id: 'webhook_s2',
        label: 'Webhook S2',
        service: 'outcome-ingress',
        sourceClass: 'S2',
        timestamp: '2026-03-02T10:20:16Z',
        status: 'SUCCESS',
        confidence: 1.0,
        ruleIds: ['l1_exact_match'],
        detail: 'evt_888 stays authoritative due to exact carrier match and UTR.',
      },
      {
        id: 'poll_s3',
        label: 'Poll S3',
        service: 'backfill-scheduler',
        sourceClass: 'S3',
        timestamp: '2026-03-02T10:24:00Z',
        status: 'SUCCESS',
        confidence: 0.92,
        ruleIds: ['poll_backfill_cadence', 'utr_weight_boost_v2_2'],
        detail: 'Poll confidence increased under v2.2 replay policy.',
      },
      {
        id: 'statement_s4',
        label: 'Statement S4',
        service: 'statement-processor',
        sourceClass: 'S4',
        timestamp: '2026-03-03T08:29:40Z',
        status: 'SUCCESS',
        confidence: 1.0,
        ruleIds: ['statement_truth_priority'],
        detail: 'Statement still highest authority and matches UTR.',
      },
      {
        id: 'fusion_finality',
        label: 'Fusion Decision',
        service: 'fusion-engine',
        sourceClass: 'FUSION',
        timestamp: '2026-03-03T08:30:00Z',
        status: 'FINALIZED',
        confidence: 1.0,
        ruleIds: ['truth_hierarchy_v2_2', 'r1_utr_wins'],
        detail: 'Replay confirms SUCCESS and reaches deterministic finality earlier.',
      },
      {
        id: 'certificate',
        label: 'Certificate',
        service: 'evidence-service',
        sourceClass: 'EVIDENCE',
        timestamp: '2026-03-03T08:30:01Z',
        status: 'CERTIFIED',
        ruleIds: ['certificate_signature_v1'],
        detail: 'Replay certificate emitted without mutating original cert_123.',
      },
    ],
  },
]

const phaseLabels = ['Ingest', 'Dispatch', 'Webhook S2', 'Poll S3', 'Statement S4', 'Certificate']
const v21Chart = [20, 34, 100, 80, 100, 100]
const v22Chart = [20, 34, 100, 92, 100, 100]

const statusClassMap: Record<AugmentedNode['status'], string> = {
  RECEIVED: 'bg-slate-100 text-slate-700',
  CANONICALIZED: 'bg-indigo-50 text-indigo-700',
  TOKENIZED: 'bg-sky-50 text-sky-700',
  READY_FOR_RELAY: 'bg-violet-50 text-violet-700',
  PENDING: 'bg-amber-50 text-amber-700',
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FINALIZED: 'bg-cyan-50 text-cyan-700',
  CERTIFIED: 'bg-slate-900 text-white',
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`
}

function formatDuration(durationMs: number) {
  if (durationMs <= 0) return '0s'
  const totalSeconds = Math.floor(durationMs / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function augmentNodes(nodes: TimelineNode[]): AugmentedNode[] {
  return nodes.map((node, index) => {
    if (index === 0) return { ...node, stepNumber: 1, durationFromPreviousMs: 0 }
    const previous = nodes[index - 1]
    const durationFromPreviousMs = Math.max(0, new Date(node.timestamp).getTime() - new Date(previous.timestamp).getTime())
    return { ...node, stepNumber: index + 1, durationFromPreviousMs }
  })
}

function ConfidenceChart() {
  const width = 920
  const height = 250
  const padding = { top: 20, right: 52, bottom: 42, left: 16 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const min = 0
  const max = 100

  const x = (index: number) => padding.left + (index / (phaseLabels.length - 1)) * chartWidth
  const y = (value: number) => padding.top + chartHeight - ((value - min) / (max - min)) * chartHeight

  const linePoints = (values: number[]) => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const areaPoints = (values: number[]) =>
    `${linePoints(values)} ${x(values.length - 1).toFixed(1)},${y(min).toFixed(1)} ${x(0).toFixed(1)},${y(min).toFixed(1)}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full">
      <defs>
        <linearGradient id="workflowConfidenceFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[20, 40, 60, 80, 100].map((tick) => (
        <g key={tick}>
          <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={width - padding.right + 8} y={y(tick) + 4} fill="#64748b" fontSize="11">
            {tick}%
          </text>
        </g>
      ))}
      <polygon points={areaPoints(v21Chart)} fill="url(#workflowConfidenceFill)" />
      <polyline points={linePoints(v22Chart)} fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="5 4" />
      <polyline points={linePoints(v21Chart)} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(v21Chart.length - 1)} cy={y(v21Chart[v21Chart.length - 1])} r="4.5" fill="#7c3aed" />
      {phaseLabels.map((label, index) => (
        <text
          key={label}
          x={x(index)}
          y={height - 10}
          fill="#6b7280"
          fontSize="11"
          textAnchor={index === 0 ? 'start' : index === phaseLabels.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </text>
      ))}
    </svg>
  )
}

export default function CustomerWorkflowTimelinePage() {
  const [scenarioId, setScenarioId] = useState(workflowScenarios[0].id)
  const scenario = useMemo(
    () => workflowScenarios.find((item) => item.id === scenarioId) ?? workflowScenarios[0],
    [scenarioId]
  )
  const nodes = useMemo(() => augmentNodes(scenario.nodes), [scenario])

  const [selectedNodeId, setSelectedNodeId] = useState(scenario.nodes[0].id)
  useEffect(() => {
    setSelectedNodeId(scenario.nodes[0].id)
  }, [scenario])

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0], [nodes, selectedNodeId])

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-cx-purple-700">Workflow Traceability</p>
          <h1 className="text-2xl font-bold leading-tight text-cx-text">Workflow Timeline</h1>
          <p className="text-sm mt-1 text-cx-neutral">
            Graph points are mapped from your “Complete Walkthrough Traceability of Zord” flow (Phase 1→6).
          </p>
        </div>
        <div className="w-full max-w-[420px]">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cx-neutral">Workflow Run</label>
          <select
            value={scenario.id}
            onChange={(event) => setScenarioId(event.target.value)}
            className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-cx-text outline-none focus:ring-2 focus:ring-cx-purple-500"
          >
            {workflowScenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-cx-neutral">{scenario.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-cx-text">Confidence Progression</h2>
              <p className="text-xs text-cx-neutral">Current v2.1 vs Replay v2.2</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-cx-text">
                <span className="h-1.5 w-3 rounded-full bg-cx-purple-600" />
                v2.1
              </span>
              <span className="flex items-center gap-1 text-cx-neutral">
                <span className="h-1.5 w-3 rounded-full bg-violet-300" />
                v2.2 replay
              </span>
            </div>
          </div>
          <div className="p-3">
            <ConfidenceChart />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="text-sm font-semibold text-cx-text">Finality Snapshot</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-cx-neutral">trace_id</span><span className="font-mono text-xs text-cx-text">{scenario.traceId}</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">envelope_id</span><span className="font-mono text-xs text-cx-text">{scenario.envelopeId}</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">intent_id</span><span className="font-mono text-xs text-cx-text">{scenario.intentId}</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">contract_id</span><span className="font-mono text-xs text-cx-text">{scenario.contractId}</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">dispatch_id</span><span className="font-mono text-xs text-cx-text">{scenario.dispatchId}</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">certificate</span><span className="font-mono text-xs text-cx-text">{scenario.certificateId}</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">finality</span><span className="font-semibold text-emerald-700">SUCCESS ({scenario.finalityConfidence.toFixed(2)})</span></div>
            <div className="flex justify-between"><span className="text-cx-neutral">finality_at</span><span className="font-mono text-xs text-cx-text">{formatTimestamp(scenario.finalityAt)}</span></div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-cx-text">Deterministic Timeline</h2>
          <span className="text-xs text-cx-neutral">{nodes.length} nodes</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => setSelectedNodeId(node.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${
                selectedNode.id === node.id
                  ? 'border-cx-purple-300 bg-cx-purple-50/40 shadow-[0_8px_16px_rgba(124,58,237,0.12)]'
                  : 'border-gray-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-cx-text">{node.label}</p>
                <span className="text-[11px] text-cx-neutral">{node.stepNumber}</span>
              </div>
              <p className="mt-0.5 text-xs text-cx-neutral">{formatDuration(node.durationFromPreviousMs)}</p>
              <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClassMap[node.status]}`}>
                {node.status}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-cx-text">Canonical Outcome Events</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-cx-neutral">
                <tr>
                  <th className="px-4 py-2 text-left">event_id</th>
                  <th className="px-4 py-2 text-left">source</th>
                  <th className="px-4 py-2 text-left">status</th>
                  <th className="px-4 py-2 text-left">provider_ref</th>
                  <th className="px-4 py-2 text-left">confidence</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-cx-text">evt_888</td>
                  <td className="px-4 py-2 text-cx-text">S2</td>
                  <td className="px-4 py-2 text-emerald-700">SUCCESS</td>
                  <td className="px-4 py-2 font-mono text-xs text-cx-text">hash(SBIN123456789)</td>
                  <td className="px-4 py-2 text-cx-text">1.0</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-cx-text">evt_889</td>
                  <td className="px-4 py-2 text-cx-text">S3</td>
                  <td className="px-4 py-2 text-emerald-700">SUCCESS</td>
                  <td className="px-4 py-2 font-mono text-xs text-cx-text">hash(SBIN123456789)</td>
                  <td className="px-4 py-2 text-cx-text">{scenario.pollConfidence.toFixed(2)}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-cx-text">evt_890</td>
                  <td className="px-4 py-2 text-cx-text">S4</td>
                  <td className="px-4 py-2 text-emerald-700">SUCCESS</td>
                  <td className="px-4 py-2 font-mono text-xs text-cx-text">hash(SBIN123456789)</td>
                  <td className="px-4 py-2 text-cx-text">1.0</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
          <h3 className="text-sm font-semibold text-cx-text">Node Detail</h3>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-cx-neutral">Node</p>
              <p className="text-sm font-semibold text-cx-text">{selectedNode.label}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-cx-neutral">Service / Source</p>
              <p className="text-sm text-cx-text">{selectedNode.service} · {selectedNode.sourceClass}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-cx-neutral">Timestamp / Duration</p>
              <p className="text-sm text-cx-text">{formatTimestamp(selectedNode.timestamp)}</p>
              <p className="text-xs text-cx-neutral mt-1">{formatDuration(selectedNode.durationFromPreviousMs)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-cx-neutral">rule_ids</p>
              <p className="text-sm text-cx-text">{selectedNode.ruleIds.join(', ')}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-cx-neutral">Context</p>
              <p className="text-sm text-cx-text">{selectedNode.detail}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
