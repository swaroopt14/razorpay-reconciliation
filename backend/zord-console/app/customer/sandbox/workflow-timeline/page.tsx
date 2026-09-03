'use client'

import { useMemo, useState } from 'react'
import { SANDBOX_INTENTS } from '../sandbox-fixtures'

type WorkflowNode = {
  id: string
  name: string
  status: string
  service: string
  version: string
  zone: string
  durationMs: number
  retryCount: number
  ruleIds: string[]
}

const DEFAULT_STAGES = ['Raw Ingest', 'Canonicalization', 'Tokenization', 'Outbox', 'Kafka Bus', 'Outcome Listener', 'Fusion', 'Evidence Builder']

const STAGE_META: Record<string, { service: string; version: string; zone: string }> = {
  RECEIVED: { service: 'edge-vault-gateway', version: 'v1.6.2', zone: 'ap-south-1a' },
  CANONICALIZED: { service: 'intent-engine', version: 'v2.3.9', zone: 'ap-south-1a' },
  READY_FOR_RELAY: { service: 'pii-enclave', version: 'v1.2.4', zone: 'ap-south-1b' },
  RELAYED: { service: 'zord-relay', version: 'v1.8.7', zone: 'ap-south-1a' },
  OUTCOME_RECEIVED: { service: 'zord-edge', version: 'v1.7.3', zone: 'ap-south-1c' },
  FUSED_SUCCESS: { service: 'fusion-engine', version: 'v2.1.2', zone: 'ap-south-1a' },
  EXCEPTION: { service: 'fusion-engine', version: 'v2.1.2', zone: 'ap-south-1a' },
  DLQ: { service: 'kafka-core', version: 'v3.5', zone: 'ap-south-1a' },
}

const DISPLAY_NAME: Record<string, string> = {
  RECEIVED: 'Raw Ingest',
  CANONICALIZED: 'Canonicalization',
  READY_FOR_RELAY: 'Tokenization',
  RELAYED: 'Outbox',
  OUTCOME_RECEIVED: 'Outcome Listener',
  FUSED_SUCCESS: 'Fusion',
  EXCEPTION: 'Fusion',
  DLQ: 'Kafka Bus',
}

export default function WorkflowTimelinePage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('n1')
  const [activeIntentId, setActiveIntentId] = useState<string>(SANDBOX_INTENTS[0].intentId)

  const activeIntent = useMemo(() => SANDBOX_INTENTS.find((intent) => intent.intentId === activeIntentId), [activeIntentId])
  const nodes = useMemo<WorkflowNode[]>(() => {
    if (!activeIntent || activeIntent.timeline.length === 0) {
      return DEFAULT_STAGES.map((name, index) => ({
        id: `n${index + 1}`,
        name,
        status: 'SIMULATED',
        service: 'sandbox-simulator',
        version: 'v1.0.0',
        zone: 'ap-south-1a',
        durationMs: 120 + index * 30,
        retryCount: 0,
        ruleIds: ['SIM_001'],
      }))
    }

    const mapped: WorkflowNode[] = activeIntent.timeline.map((step, index) => {
      const meta = STAGE_META[step.status] || { service: 'sandbox-simulator', version: 'v1.0.0', zone: 'ap-south-1a' }
      return {
        id: `n${index + 1}`,
        name: DISPLAY_NAME[step.status] || step.status,
        status: step.status,
        service: meta.service,
        version: meta.version,
        zone: meta.zone,
        durationMs: step.durationMs,
        retryCount: step.retryCount,
        ruleIds: step.ruleIds,
      }
    })

    const hasFusion = mapped.some((node) => node.name === 'Fusion')
    if (!hasFusion) {
      mapped.push({
        id: `n${mapped.length + 1}`,
        name: 'Evidence Builder',
        status: 'SIMULATED',
        service: 'contracts-service',
        version: 'v1.4.6',
        zone: 'ap-south-1b',
        durationMs: 210,
        retryCount: 0,
        ruleIds: ['EVI_001'],
      })
    }

    return mapped
  }, [activeIntent])

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) || nodes[0], [nodes, selectedNodeId])

  const traceSourceLabel = useMemo(() => {
    if (!activeIntent) return 'Synthetic fallback'
    return `Derived from sandbox intent timeline (${activeIntent.status})`
  }, [activeIntent])

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Workflow Timeline</h1>
          <p className="mt-0.5 text-sm text-cx-neutral">
            Interactive causality graph for deterministic execution nodes and rule edges.
          </p>
        </div>
        <select
          value={activeIntentId}
          onChange={(event) => setActiveIntentId(event.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono outline-none focus:border-cx-purple-500"
        >
          {SANDBOX_INTENTS.map((intent) => (
            <option key={intent.intentId} value={intent.intentId}>
              {intent.intentId}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-1 text-xs text-cx-neutral">
            Timeline playback for <span className="font-mono text-cx-text">{activeIntent?.traceId}</span>
          </div>
          <div className="mb-3 text-[11px] text-cx-neutral">{traceSourceLabel}</div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {nodes.map((node, index) => (
              <button
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  selectedNodeId === node.id ? 'border-cx-purple-300 bg-cx-purple-50' : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-cx-text">{node.name}</p>
                  <span className="text-[10px] text-cx-neutral">{index + 1}</span>
                </div>
                <p className="mt-1 text-[11px] text-cx-neutral">{node.durationMs} ms • {node.status}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-cx-neutral">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1">Directed deterministic transitions</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1">Sequential edge playback</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1">No payload PII in graph view</span>
          </div>
        </section>

        <aside className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-cx-text">Node Details</h2>
          <div className="mt-3 space-y-2 text-xs">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="font-semibold text-cx-neutral">Node</p>
              <p className="mt-1 text-cx-text">{selectedNode.name}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="font-semibold text-cx-neutral">Service</p>
              <p className="mt-1 font-mono text-cx-text">{selectedNode.service}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="font-semibold text-cx-neutral">Version / zone</p>
              <p className="mt-1 font-mono text-cx-text">
                {selectedNode.version} • {selectedNode.zone}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="font-semibold text-cx-neutral">Duration / retries</p>
              <p className="mt-1 text-cx-text">
                {selectedNode.durationMs} ms • retry_count={selectedNode.retryCount}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="font-semibold text-cx-neutral">rule_ids</p>
              <p className="mt-1 font-mono text-cx-text">{selectedNode.ruleIds.join(', ')}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
