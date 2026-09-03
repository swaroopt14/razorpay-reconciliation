'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/app/hooks'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { safeRandomId } from '@/shared/lib/safeRandomId'

type TenantReviewKpiTone = 'good' | 'warn' | 'neutral'

type TenantReviewKpi = {
  label: string
  value: string
  delta: string
  tone: TenantReviewKpiTone
}

type TenantReviewPoint = {
  label: string
  value: number
}

type TenantProviderRow = {
  provider: string
  successRate: number
  p95LatencyMs: number
  errorRate: number
  volume: number
}

type TenantReasonRow = {
  code: string
  events: number
  share: number
}

type TenantReviewPayload = {
  tenant: string
  windowLabel: string
  generatedAt: string
  headline: string
  summary: string
  kpis: TenantReviewKpi[]
  trend: TenantReviewPoint[]
  providers: TenantProviderRow[]
  reasons: TenantReasonRow[]
  actions: string[]
}

type UserChatItem = { id: string; type: 'user'; text: string; created_at: string | null }
type SystemChatItem = { id: string; type: 'system'; text: string; created_at: string | null; mockReview?: TenantReviewPayload }
type ChatItem = UserChatItem | SystemChatItem

type CopilotCitation = {
  source_type: string
  record_id: string
  chunk_id: string
  snippet: string
  score: number
}

type CopilotResponse = {
  answer: string
  confidence: string
  entities_found?: {
    intent_id?: string
    trace_id?: string
  }
  citations?: CopilotCitation[]
  next_actions?: string[]
  tenant_review?: TenantReviewPayload
}

const TENANT_ALIASES: Record<string, string> = {
  megamart_prod: 'megamart_prod',
  acmepay: 'AcmePay',
  'bandhan bank': 'Bandhan Bank',
  zomato: 'Zomato',
  ajio: 'Ajio',
  amazon: 'Amazon',
  swiggy: 'Swiggy',
  flipkart: 'Flipkart',
}

function nowIso() {
  return new Date().toISOString()
}

function hasMissingGeminiKey(details: unknown): boolean {
  const s = String(details || '')
  return s.includes('missing GEMINI_API_KEY/GEMINI_API_KEYS') || s.includes('GEMINI_API_KEY') || s.includes('GEMINI_API_KEYS')
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function djb2Hash(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) + input.charCodeAt(i)
  return h >>> 0
}

function xorshift32(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return x >>> 0
  }
}

function toHex(n: number, width: number): string {
  return (n >>> 0).toString(16).padStart(width, '0').slice(-width)
}

function mockUuid(nextU32: () => number): string {
  const a = toHex(nextU32(), 8)
  const b = toHex(nextU32(), 4)
  const c = toHex(nextU32(), 4)
  const d = toHex(nextU32(), 4)
  const e = toHex(nextU32(), 12)
  return `${a}-${b}-${c}-${d}-${e}`
}

function formatSignedPercent(value: number): string {
  const arrow = value >= 0 ? '↑' : '↓'
  return `${arrow} ${Math.abs(value).toFixed(2)}%`
}

function formatSignedMs(value: number): string {
  const arrow = value >= 0 ? '↑' : '↓'
  return `${arrow} ${Math.abs(Math.round(value))}ms`
}

function parseWindowLabel(prompt: string): string {
  const normalized = prompt.toLowerCase()
  if (normalized.includes('7d') || normalized.includes('7 days')) return 'Last 7 days'
  if (normalized.includes('30d') || normalized.includes('30 days') || normalized.includes('monthly')) return 'Last 30 days'
  if (normalized.includes('1h') || normalized.includes('hour')) return 'Last 1 hour'
  return 'Last 24 hours'
}

function extractTenantName(prompt: string, fallbackTenant: string): string {
  const normalized = prompt.toLowerCase()

  for (const [alias, resolved] of Object.entries(TENANT_ALIASES)) {
    if (normalized.includes(alias)) return resolved
  }

  const quotedMatch = prompt.match(/tenant(?:\s+name)?\s*(?:is|=|:)?\s*["']([^"']{2,40})["']/i)
  if (quotedMatch?.[1]) return quotedMatch[1].trim()

  const plainMatch = prompt.match(/tenant(?:\s+name)?\s*(?:is|=|:)?\s*([a-z0-9_. -]{2,40})/i)
  if (plainMatch?.[1]) return plainMatch[1].trim()

  return fallbackTenant
}

function shouldGenerateTenantReview(prompt: string): boolean {
  const normalized = prompt.toLowerCase()
  const include = ['review', 'dashboard', 'performance', 'analysis', 'trend', 'sla', 'health', 'status', 'provider', 'tenant', 'report', 'error', 'failure', 'exception']
  const exclude = ['how to', 'schema', 'versioning', 'field', 'explain finality', 'what is finality']
  if (exclude.some((keyword) => normalized.includes(keyword))) return false
  return include.some((keyword) => normalized.includes(keyword))
}

function createDeterministicRandom(seedInput: string): () => number {
  const nextU32 = xorshift32(djb2Hash(seedInput))
  return () => nextU32() / 4294967295
}

function buildMockTenantReview(
  prompt: string,
  fallbackTenant: string,
  intentFromUrl?: string | null
): { response: CopilotResponse; review: TenantReviewPayload } {
  const dayUtc = new Date().toISOString().slice(0, 10)
  const tenant = extractTenantName(prompt, fallbackTenant)
  const windowLabel = parseWindowLabel(prompt)
  const random = createDeterministicRandom(`${dayUtc}::${tenant}::${prompt}`)

  const successRate = +(96 + random() * 2.7).toFixed(2)
  const errorRate = +(100 - successRate).toFixed(2)
  const p95Latency = Math.round(130 + random() * 180)
  const recoverySla = +(90 + random() * 8.8).toFixed(2)
  const totalVolume = Math.round(16000 + random() * 26000)

  const authDelta = +(random() * 2.4 - 1.2).toFixed(2)
  const errorDelta = +(random() * 1.6 - 0.8).toFixed(2)
  const latencyDelta = random() * 70 - 35
  const recoveryDelta = +(random() * 4.2 - 2.1).toFixed(2)

  const kpis: TenantReviewKpi[] = [
    {
      label: 'Auth Success',
      value: `${successRate.toFixed(2)}%`,
      delta: `${formatSignedPercent(authDelta)} vs previous window`,
      tone: authDelta >= 0 ? 'good' : 'warn',
    },
    {
      label: 'Error Rate',
      value: `${errorRate.toFixed(2)}%`,
      delta: `${formatSignedPercent(errorDelta)} vs previous window`,
      tone: errorDelta <= 0 ? 'good' : 'warn',
    },
    {
      label: 'P95 Latency',
      value: `${p95Latency}ms`,
      delta: `${formatSignedMs(latencyDelta)} vs previous window`,
      tone: latencyDelta <= 0 ? 'good' : 'warn',
    },
    {
      label: 'Retry Recovery',
      value: `${recoverySla.toFixed(2)}%`,
      delta: `${formatSignedPercent(recoveryDelta)} vs previous window`,
      tone: recoveryDelta >= 0 ? 'good' : 'neutral',
    },
  ]

  const trendLabels = windowLabel === 'Last 24 hours' ? ['00h', '04h', '08h', '12h', '16h', '20h', '24h'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let runningValue = successRate - 0.9 + (random() * 0.6 - 0.3)
  const trend: TenantReviewPoint[] = trendLabels.map((label) => {
    runningValue = clamp(runningValue + (random() * 1.2 - 0.6), 92.1, 99.6)
    return { label, value: +runningValue.toFixed(2) }
  })

  const providerNames = ['Razorpay', 'Cashfree', 'PhonePe', 'Stripe', 'PayPal']
  const providerWeights = providerNames.map(() => 0.4 + random())
  const weightSum = providerWeights.reduce((acc, value) => acc + value, 0)

  const providers: TenantProviderRow[] = providerNames
    .map((provider, idx) => {
      const volume = Math.max(800, Math.round((totalVolume * providerWeights[idx]) / weightSum))
      const providerSuccess = clamp(successRate + (random() * 2.2 - 1.1), 92.2, 99.8)
      const providerP95 = Math.max(90, Math.round(p95Latency + (random() * 90 - 45)))
      return {
        provider,
        successRate: +providerSuccess.toFixed(2),
        p95LatencyMs: providerP95,
        errorRate: +(100 - providerSuccess).toFixed(2),
        volume,
      }
    })
    .sort((a, b) => b.volume - a.volume)

  const reasonCodes = ['PROVIDER_TIMEOUT', 'WEBHOOK_DELIVERY_FAILED', 'RATE_LIMIT', 'INVALID_SIGNATURE', 'IDEMPOTENCY_CONFLICT']
  const reasonWeights = reasonCodes.map(() => 0.3 + random())
  const reasonWeightSum = reasonWeights.reduce((acc, value) => acc + value, 0)
  const totalFailures = Math.max(20, Math.round((totalVolume * errorRate) / 100))
  const reasons: TenantReasonRow[] = reasonCodes
    .map((code, idx) => {
      const events = Math.max(1, Math.round((totalFailures * reasonWeights[idx]) / reasonWeightSum))
      return {
        code,
        events,
        share: +((events / totalFailures) * 100).toFixed(1),
      }
    })
    .sort((a, b) => b.events - a.events)

  const primaryReason = reasons[0]?.code ?? 'PROVIDER_TIMEOUT'
  const actions = [
    `Prioritize ${primaryReason} triage for ${tenant} over the next 2 hours.`,
    `Route high-value retries to provider legs with p95 latency below ${Math.max(100, p95Latency - 30)}ms.`,
    `Track the next ${windowLabel.toLowerCase()} for stabilization before widening retry concurrency.`,
  ]

  const review: TenantReviewPayload = {
    tenant,
    windowLabel,
    generatedAt: nowIso(),
    headline: `${tenant} reliability review`,
    summary: `${totalVolume.toLocaleString('en-IN')} transactions analyzed. Success remains at ${successRate.toFixed(2)}%, with ${primaryReason} as the dominant exception path.`,
    kpis,
    trend,
    providers,
    reasons,
    actions,
  }

  const response: CopilotResponse = {
    answer: `Generated a simulated data review for ${tenant} (${windowLabel}). Values are mock but internally consistent for dashboard validation.`,
    confidence: 'demo-sim',
    entities_found: {
      intent_id: intentFromUrl ?? undefined,
      trace_id: mockUuid(xorshift32(djb2Hash(`${tenant}::trace::${prompt}`))),
    },
    next_actions: actions,
    tenant_review: review,
  }

  return { response, review }
}

function buildDemoMockAnswer(prompt: string): CopilotResponse {
  const dayUtc = new Date().toISOString().slice(0, 10)
  const seed = djb2Hash(`${dayUtc}::${prompt}`)
  const rnd = xorshift32(seed)

  const intentA = mockUuid(rnd)
  const intentB = mockUuid(rnd)
  const intentC = mockUuid(rnd)
  const traceA = mockUuid(rnd)

  const normalized = prompt.trim().toLowerCase()
  const isSummary = normalized.includes('summarize') || normalized.includes('today') || normalized.includes('intents')

  if (isSummary) {
    return {
      answer: [
        `Demo (mock): Prompt Layer LLM key is not configured, so this is a deterministic fallback response for ${dayUtc} (UTC).`,
        '',
        'Ingestion summary (UTC):',
        '- Intents processed: 12',
        '- Rejected / DLQ: 2',
        '- In-flight: 1',
        '',
        'Notable intents:',
        `- intent_id=${intentA} (status=READY) trace_id=${traceA}`,
        `- intent_id=${intentB} (status=VALIDATED)`,
        `- intent_id=${intentC} (status=DLQ: semantic_validation_failed)`,
      ].join('\n'),
      confidence: 'demo',
      entities_found: { intent_id: intentA, trace_id: traceA },
      next_actions: ['Review DLQ items in console', 'Fix validation errors and resubmit with a new idempotency key'],
    }
  }

  return {
    answer: [
      'Demo (mock): Prompt Layer LLM key is not configured, so this is a deterministic fallback response.',
      '',
      `What I understood: "${prompt.trim()}"`,
      '',
      'Try: "Review tenant megamart_prod performance for last 24h" for a detailed data-driven response.',
    ].join('\n'),
    confidence: 'demo',
  }
}

function kpiToneClass(tone: TenantReviewKpiTone): string {
  if (tone === 'good') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function MiniTrendChart({ series }: { series: TenantReviewPoint[] }) {
  const width = 460
  const height = 170
  const pad = { top: 16, right: 10, bottom: 28, left: 8 }
  const values = series.map((point) => point.value)
  const min = Math.max(0, Math.floor(Math.min(...values) - 1))
  const max = Math.ceil(Math.max(...values) + 1)
  const chartWidth = width - pad.left - pad.right
  const chartHeight = height - pad.top - pad.bottom

  const x = (index: number) => pad.left + (index / Math.max(1, series.length - 1)) * chartWidth
  const y = (value: number) => pad.top + chartHeight - ((value - min) / Math.max(1, max - min)) * chartHeight

  const line = series.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const area = `${line} ${x(series.length - 1).toFixed(1)},${y(min).toFixed(1)} ${x(0).toFixed(1)},${y(min).toFixed(1)}`

  const ticks = [min, Math.round((min + max) / 2), max]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[170px] w-full">
      <defs>
        <linearGradient id="cx-review-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.26)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.02)" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={width - pad.right - 2} y={y(tick) - 4} fill="#64748b" fontSize="10" textAnchor="end">
            {tick}%
          </text>
        </g>
      ))}

      <polygon points={area} fill="url(#cx-review-area)" />
      <polyline points={line} fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {series.map((point, index) => (
        <g key={point.label}>
          <circle cx={x(index)} cy={y(point.value)} r="2.8" fill="#4f46e5" />
          <text x={x(index)} y={height - 8} fill="#6b7280" fontSize="10" textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function MockTenantReviewCard({ review, intro }: { review: TenantReviewPayload; intro?: string }) {
  return (
    <div className="space-y-3">
      {intro ? <p className="text-sm leading-6 text-slate-700">{intro}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">AI Companion</p>
              <h4 className="text-sm font-semibold text-slate-900">{review.headline}</h4>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Tenant: {review.tenant}</span>
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1">{review.windowLabel}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">{review.summary}</p>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {review.kpis.map((kpi) => (
              <div key={kpi.label} className={`rounded-xl border p-2.5 ${kpiToneClass(kpi.tone)}`}>
                <p className="text-[11px] font-medium uppercase tracking-wide">{kpi.label}</p>
                <p className="mt-1 text-lg font-semibold">{kpi.value}</p>
                <p className="mt-0.5 text-[11px]">{kpi.delta}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1 text-xs font-semibold text-slate-700">Authorization Trend</div>
              <MiniTrendChart series={review.trend} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Provider Performance</div>
              <div className="overflow-auto">
                <table className="w-full min-w-[340px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2">Provider</th>
                      <th className="pb-2">Success</th>
                      <th className="pb-2">P95</th>
                      <th className="pb-2 text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.providers.map((row) => (
                      <tr key={row.provider} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 font-medium text-slate-700">{row.provider}</td>
                        <td className="py-1.5 text-slate-700">{row.successRate.toFixed(2)}%</td>
                        <td className="py-1.5 text-slate-700">{row.p95LatencyMs}ms</td>
                        <td className="py-1.5 text-right text-slate-700">{row.volume.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Top Reason Codes</div>
              <div className="space-y-2">
                {review.reasons.map((reason) => (
                  <div key={reason.code}>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                      <span className="font-medium text-slate-700">{reason.code}</span>
                      <span>{reason.events} events</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${reason.share}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Recommended Actions</div>
              <ul className="space-y-1.5">
                {review.actions.map((action, index) => (
                  <li key={action} className="text-xs leading-5 text-slate-700">
                    {index + 1}. {action}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-slate-500">Generated: {review.generatedAt}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CopilotChatCore({
  intentFromUrl,
  compact,
  variant,
  onRequestClose,
}: {
  intentFromUrl?: string | null
  compact?: boolean
  variant?: 'glass' | 'page'
  onRequestClose?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [tenantContext, setTenantContext] = useState('megamart_prod')
  const { tenantId: sessionTenantId } = useSessionTenant()
  const { user } = useAuth()
  const [promptSessionId] = useState(() => safeRandomId())
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<ChatItem[]>(() => {
    const base: ChatItem[] = [
      {
        id: 'sys_0',
        type: 'system',
        created_at: null,
        text: 'Zord Copilot is connected to Prompt Layer. Ask for a tenant review to get a dashboard-style response with metrics and trends.',
      },
    ]
    if (intentFromUrl) {
      base.push({
        id: 'sys_intent',
        type: 'system',
        created_at: null,
        text: `Context: intent=${intentFromUrl}`,
      })
    }
    return base
  })

  useEffect(() => {
    setMounted(true)
    setItems((prev) => prev.map((it) => (it.created_at ? it : { ...it, created_at: nowIso() })))
    try {
      const localTenant = localStorage.getItem('cx_tenant_name')
      if (localTenant?.trim()) setTenantContext(localTenant.trim())
    } catch {
      // Keep default tenant context.
    }
  }, [])

  const canSend = useMemo(() => draft.trim().length > 0 && !isSending, [draft, isSending])
  const hasUserMessages = useMemo(() => items.some((it) => it.type === 'user'), [items])
  const densityPad = compact ? 'px-4 py-3' : 'px-5 py-4'

  const formatResponseText = useCallback((resp: CopilotResponse) => {
    const lines: string[] = []
    lines.push(resp.answer || 'No answer returned.')
    lines.push('')
    lines.push(`Confidence: ${resp.confidence || 'unknown'}`)

    if (resp.entities_found?.intent_id || resp.entities_found?.trace_id) {
      lines.push(`Entities: intent_id=${resp.entities_found?.intent_id || '-'}, trace_id=${resp.entities_found?.trace_id || '-'}`)
    }

    if (resp.citations?.length) {
      lines.push('')
      lines.push('Citations:')
      resp.citations.forEach((citation, index) => {
        lines.push(`${index + 1}. ${citation.source_type} | record=${citation.record_id} | score=${Number(citation.score || 0).toFixed(2)}`)
        lines.push(`   ${citation.snippet}`)
      })
    }

    if (resp.next_actions?.length) {
      lines.push('')
      lines.push('Next actions:')
      resp.next_actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`))
    }

    return lines.join('\n')
  }, [])

  const pushSystemMessage = useCallback((message: Omit<SystemChatItem, 'type'>) => {
    setItems((prev) => [...prev, { ...message, type: 'system' }])
  }, [])

  const submit = useCallback(async () => {
    const text = draft.trim()
    if (!text || isSending) return

    setIsSending(true)
    setDraft('')
    setItems((prev) => [...prev, { id: `u_${Date.now()}`, type: 'user', created_at: nowIso(), text }])

    try {
      const tenantMatch = text.match(/tenant(?:\s+id)?\s*(?:is|=|:)?\s*([0-9a-fA-F-]{36})/i)
      const tenantId = tenantMatch?.[1] ?? null
      const baseUrl = process.env.NEXT_PUBLIC_PROMPT_LAYER_URL || '/api/prompt-layer'
      const payload: Record<string, unknown> = { query: text }
      if (tenantId) payload.tenant_id = tenantId
      if (intentFromUrl) payload.intent_id = intentFromUrl

      const tenantHeader = tenantId || sessionTenantId?.trim() || undefined
      const userId = user?.id
      const sessionIdHeader = promptSessionId

      const res = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantHeader ? { 'x-tenant-id': tenantHeader } : {}),
          ...(sessionIdHeader ? { 'x-session-id': sessionIdHeader } : {}),
          ...(userId ? { 'x-user-id': userId } : {}),
        },
        body: JSON.stringify(payload),
      })

      const raw = await res.text()
      let body: Partial<CopilotResponse> & { details?: string } = {}
      try {
        const parsed = raw ? (JSON.parse(raw) as unknown) : {}
        body = typeof parsed === 'object' && parsed !== null ? (parsed as Partial<CopilotResponse> & { details?: string }) : { details: String(parsed) }
      } catch {
        body = { details: raw }
      }

      if (!res.ok) {
        const details = body.details ? `\nDetails: ${String(body.details)}` : ''
        throw new Error(`Prompt query failed.${details}`)
      }

      const response = body as CopilotResponse
      if (response.tenant_review) {
        pushSystemMessage({
          id: `sys_${Date.now()}_response_review`,
          created_at: nowIso(),
          text: response.answer || 'Generated tenant review.',
          mockReview: response.tenant_review,
        })
      } else {
        pushSystemMessage({
          id: `sys_${Date.now()}_response`,
          created_at: nowIso(),
          text: formatResponseText(response),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      pushSystemMessage({
        id: `sys_${Date.now()}_error`,
        created_at: nowIso(),
        text: `Query failed.\n${message}`,
      })
    } finally {
      setIsSending(false)
    }
  }, [draft, formatResponseText, intentFromUrl, isSending, pushSystemMessage, promptSessionId, sessionTenantId, user?.id])

  const clear = useCallback(() => {
    setDraft('')
    setItems((prev) => prev.filter((it) => it.id === 'sys_0' || it.id === 'sys_intent'))
  }, [])

  const applySuggestion = useCallback((text: string) => {
    setDraft(text)
  }, [])

  const suggestions = useMemo(
    () => [
      'Review tenant megamart_prod performance (last 24h)',
      'Show SLA trend for Bandhan Bank',
      'Compare provider health for AcmePay',
      "Summarize today's intents",
      'Show me recent errors',
      'Why did my last intent fail?',
    ],
    []
  )

  const contentWidth = compact ? 'max-w-none' : 'max-w-3xl'

  return (
    <div className="flex h-full flex-col">
      <div className={densityPad} style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={compact ? 'text-sm font-extrabold tracking-tight' : 'text-base font-extrabold tracking-tight'} style={{ color: 'var(--text)' }}>
              <span className="inline-flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tighter">Z</span>
                <span>Ask me anything about Zord Vault</span>
              </span>
            </div>
            <div className="text-[11px] font-medium" style={{ color: 'var(--glass-item-text)' }}>
              {variant === 'page' ? 'This is a full-page prompt workspace.' : 'Cmd/Ctrl + Space to open.'} Shift+Enter for newline.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {variant === 'glass' ? (
              <Link
                href="/customer/copilot"
                className="rounded-[12px] px-2.5 py-1.5 text-[11px] font-semibold"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--glass-item-text)',
                }}
                title="Open the full prompt workspace"
              >
                Open page
              </Link>
            ) : null}
            <button
              type="button"
              onClick={clear}
              className="rounded-[12px] px-2.5 py-1.5 text-[11px] font-semibold"
              style={{
                background: 'var(--glass-item-hover-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--glass-item-active)',
              }}
              title="Clear chat"
            >
              New chat
            </button>
            <div className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: 'var(--glass-badge-bg)', color: 'var(--glass-badge-text)' }} title="Connected to Prompt Layer">
              LIVE
            </div>
            {onRequestClose ? (
              <button
                type="button"
                onClick={onRequestClose}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: 'transparent',
                  color: 'var(--glass-item-text)',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'var(--glass-item-hover-bg)'
                  event.currentTarget.style.borderColor = 'var(--glass-border)'
                  event.currentTarget.style.color = 'var(--glass-item-hover)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent'
                  event.currentTarget.style.borderColor = 'transparent'
                  event.currentTarget.style.color = 'var(--glass-item-text)'
                }}
                aria-label="Close"
                title="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="cx-glass-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={`${contentWidth} mx-auto space-y-5 px-4 py-5 sm:px-6`}>
          {!hasUserMessages && (
            <div className="py-4 sm:py-6">
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                      background: 'var(--glass-panel)',
                      border: '1px solid var(--glass-border)',
                      color: 'var(--glass-item-active)',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'var(--glass-item-hover-bg)'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'var(--glass-panel)'
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="mt-1 flex-shrink-0">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-[12px] text-xs font-black"
                  style={{
                    background: item.type === 'user' ? 'rgba(124,58,237,0.14)' : 'var(--glass-badge-bg)',
                    border: '1px solid var(--glass-border)',
                    color: item.type === 'user' ? 'var(--cx-primary)' : 'var(--glass-badge-text)',
                  }}
                  title={item.type === 'user' ? 'You' : 'System'}
                >
                  {item.type === 'user' ? 'Y' : 'Z'}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold" style={{ color: 'var(--glass-item-text)' }}>
                    {item.type === 'user' ? 'You' : 'System'}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--glass-item-disabled)' }} suppressHydrationWarning>
                    {mounted ? (item.created_at ?? '') : ''}
                  </div>
                </div>
                <div
                  className="mt-1 rounded-[16px] px-3 py-2.5 text-sm"
                  style={{
                    background: item.type === 'user' ? 'rgba(124,58,237,0.08)' : 'var(--glass-panel)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text)',
                    boxShadow: item.type === 'user' ? 'none' : 'var(--glass-shadow-sm)',
                    whiteSpace: item.type === 'system' && item.mockReview ? 'normal' : 'pre-wrap',
                  }}
                >
                  {item.type === 'system' && item.mockReview ? <MockTenantReviewCard review={item.mockReview} intro={item.text} /> : item.text}
                </div>
              </div>
            </div>
          ))}

          <div className="h-6" />
        </div>
      </div>

      <div className="border-t p-4" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a prompt (live query to Prompt Layer)..."
            className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--glass-panel)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text)',
              minHeight: 72,
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (canSend) submit()
              }
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{
              background: canSend ? 'var(--cx-primary, #6d5efc)' : 'var(--glass-item-hover-bg)',
              color: canSend ? '#fff' : 'var(--glass-item-disabled)',
              border: '1px solid var(--glass-border)',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
