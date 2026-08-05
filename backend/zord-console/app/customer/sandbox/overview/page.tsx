'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ACTIVITY_FEED, EVIDENCE_PACKS, SANDBOX_INTENTS, WEBHOOK_ENDPOINTS } from '../sandbox-fixtures'

export default function CustomerOverviewPage() {
  const metrics = useMemo(() => {
    const total = SANDBOX_INTENTS.length
    const success = SANDBOX_INTENTS.filter((intent) => intent.status === 'FUSED_SUCCESS').length
    const exceptions = SANDBOX_INTENTS.filter((intent) => intent.status === 'EXCEPTION' || intent.status === 'DLQ').length
    const slaWithin = SANDBOX_INTENTS.filter((intent) => {
      const totalDuration = intent.timeline.reduce((sum, step) => sum + step.durationMs, 0)
      return totalDuration <= 12000
    }).length
    return {
      intentsToday: total,
      successRate: Math.round((success / Math.max(total, 1)) * 1000) / 10,
      exceptions,
      evidencePacks: EVIDENCE_PACKS.length,
      slaHealth: Math.round((slaWithin / Math.max(total, 1)) * 1000) / 10,
      activeWebhooks: WEBHOOK_ENDPOINTS.filter((endpoint) => endpoint.status !== 'Disabled').length,
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cx-text">Sandbox Dashboard</h1>
          <p className="mt-1 text-sm text-cx-neutral">
            Environment-aware simulation console for deterministic flows, traceability, and evidence integrity.
          </p>
        </div>
        <Link
          href="/customer/sandbox/intents/replay"
          className="rounded-lg bg-cx-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cx-purple-700"
        >
          Open Replay Simulation
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Intents Created', value: String(metrics.intentsToday), sub: 'Today' },
          { label: 'Success Rate', value: `${metrics.successRate}%`, sub: 'FUSED_SUCCESS / total' },
          { label: 'Exceptions', value: String(metrics.exceptions), sub: 'Open in last 24h' },
          { label: 'Evidence Packs', value: String(metrics.evidencePacks), sub: 'Generated' },
          { label: 'SLA Health', value: `${metrics.slaHealth}%`, sub: 'Within latency objective' },
          { label: 'Active Webhooks', value: String(metrics.activeWebhooks), sub: 'Enabled + Degraded' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-cx-text">{card.value}</p>
            <p className="mt-1 text-[11px] text-cx-neutral">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-gray-100 bg-white">
          <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-cx-text">Recent Activity Feed</h2>
              <p className="text-xs text-cx-neutral">ID-first events with tokenized references only.</p>
            </div>
            <Link href="/customer/sandbox/intents" className="text-xs font-semibold text-cx-purple-600 hover:text-cx-purple-700">
              Open Intent Journal →
            </Link>
          </header>
          <ul className="divide-y divide-gray-50">
            {ACTIVITY_FEED.map((item) => (
              <li key={item} className="px-5 py-3 text-sm text-cx-text">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-cx-text">Sandbox Guardrails</h2>
          <p className="mt-1 text-xs text-cx-neutral">
            Boundaries follow regulatory sandbox style controls for caps, traceability, and replay isolation.
          </p>
          <div className="mt-4 space-y-2 text-xs text-cx-text">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              Replays are simulation-only and always tagged with `replay_id`.
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              Canonical and evidence views never display plaintext PAN/account/email.
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              Exports and downloads are audit logged with actor, tenant, env, and filter scope.
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              Webhook tests never touch live rails and support deterministic failure injection.
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
