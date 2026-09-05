'use client'
import { useEffect, useRef, useState } from 'react'

const trendPoints = [72, 68, 82, 64, 70, 65, 74, 60, 58, 66, 88, 94, 280, 92, 110, 78, 102, 90]
const trendLabels = ['00:00', '00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '18:00']

const kpis = [
  { label: 'Current Status', badge: 'Watch', value: 'Watch', desc: 'Current operational condition', tone: 'watch' },
  { label: 'Evidence Coverage', badge: 'High', value: 'High', desc: 'Breadth and depth of supporting records', tone: 'high' },
  { label: 'Failure Pressure', badge: 'Rising', value: 'Rising', desc: 'Failure trend in selected time window', tone: 'rising' },
  { label: 'Answer Confidence', badge: 'High', value: 'High', desc: 'Confidence from consistency of evidence', tone: 'high' },
] as const

const cardStyle: React.CSSProperties = {
  background: 'var(--pl-card)',
  border: '1px solid var(--pl-border)',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
}

function badgeStyle(tone: 'watch' | 'high' | 'rising'): React.CSSProperties {
  if (tone === 'watch') return { background: '#F5A623', color: '#fff' }
  if (tone === 'rising') return { background: '#E05252', color: '#fff' }
  return { background: '#27AE60', color: '#fff' }
}

function TrendChart() {
  const w = 940
  const h = 250
  const pad = { t: 16, r: 16, b: 34, l: 42 }
  const min = 0
  const max = 300
  const chartW = w - pad.l - pad.r
  const chartH = h - pad.t - pad.b

  const x = (i: number) => pad.l + (i / (trendPoints.length - 1)) * chartW
  const y = (v: number) => pad.t + chartH - ((v - min) / (max - min)) * chartH

  const line = trendPoints.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `${line} ${x(trendPoints.length - 1)},${y(0)} ${x(0)},${y(0)}`
  const spikeIndex = 12

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[250px] w-full">
      <defs>
        <linearGradient id="pl-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(126,154,196,0.22)" />
          <stop offset="100%" stopColor="rgba(126,154,196,0.04)" />
        </linearGradient>
      </defs>

      {[0, 60, 120, 180, 240, 300].map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={w - pad.r} y1={y(tick)} y2={y(tick)} stroke="#F0F0F0" />
          <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="#777">
            {tick}
          </text>
        </g>
      ))}

      <polygon points={area} fill="url(#pl-area)" />
      <polyline points={line} fill="none" stroke="#7A8BA6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(spikeIndex)} cy={y(trendPoints[spikeIndex])} r="5" fill="#E77F63" stroke="#fff" strokeWidth="2" />
      <line x1={x(spikeIndex)} y1={y(trendPoints[spikeIndex]) - 8} x2={x(spikeIndex) + 62} y2={y(trendPoints[spikeIndex]) - 38} stroke="#C9A085" />
      <text x={x(spikeIndex) + 66} y={y(trendPoints[spikeIndex]) - 40} fontSize="11" fill="#7A5A45">
        Anomaly or spike
      </text>

      <text x={18} y={h / 2} transform={`rotate(-90 18 ${h / 2})`} fontSize="11" fill="#666">
        Rate/volume
      </text>
      <text x={w / 2} y={h - 8} textAnchor="middle" fontSize="11" fill="#666">
        time
      </text>

      {trendLabels.map((label, i) => {
        const idx = Math.round((i / (trendLabels.length - 1)) * (trendPoints.length - 1))
        return (
          <text key={`${label}-${i}`} x={x(idx)} y={h - 16} textAnchor="middle" fontSize="10" fill="#777">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="hidden lg:flex items-center justify-end pr-4">
      <span className="text-[11px] tracking-[0.14em] uppercase text-[#999] font-semibold text-right leading-4">{text}</span>
    </div>
  )
}

export function PromptLayerExplainability() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [isBarFocused, setIsBarFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submitQuery = () => {
    const next = query.trim()
    if (!next) return
    setSubmittedQuery(next)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      style={
        {
          '--pl-canvas': '#F5F0E8',
          '--pl-card': '#FFFFFF',
          '--pl-border': '#E5E0D8',
          '--pl-heading': '#1A1A1A',
          '--pl-text': '#555555',
        } as React.CSSProperties
      }
      className="min-h-screen px-4 py-6 pb-[88px] sm:px-6"
    >
      <div className="mx-auto max-w-[1300px] rounded-xl border border-[var(--pl-border)] bg-[var(--pl-canvas)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--pl-border)] px-5 py-4">
          <div>
            <h1 className="text-[30px] font-semibold leading-tight text-[var(--pl-heading)]">Prompt Layer Explainability</h1>
            <p className="text-[13px] text-[var(--pl-text)]">Operational insight generated from validated evidence</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: '#F5A623', color: '#fff' }}>
              Watch
            </span>
            <button className="rounded-full border border-[var(--pl-border)] bg-white px-3 py-1 text-[12px] text-[var(--pl-heading)]">
              Last 24 hours
            </button>
            <div className="text-right">
              <p className="text-[12px] font-semibold text-[var(--pl-heading)]">Data Freshness</p>
              <p className="text-[11px] text-[#777]">Updated 2 min ago</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
          <div className="space-y-4">
            <div className="mt-6 grid lg:grid-cols-[180px_minmax(0,1fr)]">
              <SectionLabel text="INSIGHT HEADER CARD" />
              <div style={cardStyle} className="p-4">
                <h2 className="text-[36px] font-semibold leading-tight text-[var(--pl-heading)]">Corridor transactions showing increased friction.</h2>
                <p className="mt-2 text-[14px] text-[var(--pl-text)]">
                  Elevated latency and failure rates observed on the USD-MXN corridor over the last few hours.
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
              <SectionLabel text="EXECUTIVE SUMMARY CARD" />
              <div style={cardStyle} className="p-4">
                <h3 className="text-[24px] font-semibold text-[var(--pl-heading)]">Executive Summary</h3>
                <ul className="mt-2 list-disc pl-5 text-[14px] leading-7 text-[var(--pl-text)]">
                  <li>Payment processing latency increased by 15% on the primary USD-MXN corridor.</li>
                  <li>This impacts timely transaction settlement and customer satisfaction for cross-border payments.</li>
                  <li>Latency is significantly higher compared to the historical average for this specific timeframe.</li>
                </ul>
              </div>
            </div>

            <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
              <SectionLabel text="KPI SNAPSHOT ROW" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.map((kpi) => (
                  <div key={kpi.label} style={cardStyle} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-[#666]">{kpi.label}</p>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={badgeStyle(kpi.tone)}>
                        {kpi.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-[26px] font-bold text-[var(--pl-heading)]">{kpi.value}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--pl-text)]">{kpi.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
              <SectionLabel text="PRIMARY VISUALIZATION CARD" />
              <div style={cardStyle} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[30px] font-semibold text-[var(--pl-heading)]">Trend Overview</h4>
                  <div className="flex items-center gap-4 text-[12px] text-[#666]">
                    <span>- Maximum series</span>
                    <span>• Max series</span>
                  </div>
                </div>
                <TrendChart />
              </div>
            </div>

            <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
              <SectionLabel text="EXPLAINABILITY CARD" />
              <div style={cardStyle} className="p-4">
                <h4 className="text-[30px] font-semibold text-[var(--pl-heading)]">How this answer was derived</h4>
                <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--pl-heading)]">Data Sources Used</p>
                    <p className="mt-1 text-[13px] leading-6 text-[var(--pl-text)]">
                      Payment logs, payment logs, payment logs, network metrics, customer support tickets.
                    </p>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--pl-heading)]">Filters Applied</p>
                    <ul className="mt-1 list-disc pl-5 text-[13px] leading-6 text-[var(--pl-text)]">
                      <li>Time range: Time 24 hours</li>
                      <li>Currency and status</li>
                      <li>Status</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--pl-heading)]">Reasoning Path</p>
                    <ol className="mt-1 list-decimal pl-5 text-[13px] leading-6 text-[var(--pl-text)]">
                      <li>Analysis the current prepency and mansaconut corridor.</li>
                      <li>Correlate dateny transactions and customer risifications.</li>
                      <li>Generate processes in transaction and fed overag USD-MAN corridor.</li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--pl-heading)]">Confidence Reason</p>
                    <p className="mt-1 text-[13px] leading-6 text-[var(--pl-text)]">
                      Confidence of evidence across consistent of evidence across data sources, and unclitismomet and thirtines in tracomission ternics.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid lg:grid-cols-[1fr]">
              <SectionLabel text="QUERY CARD" />
              <div style={cardStyle} className="p-4">
                {submittedQuery ? (
                  <div className="rounded-xl px-3 py-2 text-[14px] text-[#1f2a44]" style={{ background: '#E8EEF7' }}>
                    {submittedQuery}
                  </div>
                ) : (
                  <div className="rounded-xl px-3 py-2 text-[13px] text-[#5f6b7a]" style={{ background: '#E8EEF7' }}>
                    Submit a query to view explainable output.
                  </div>
                )}
                <div className="mt-3 text-[13px] leading-6 text-[var(--pl-text)]">
                  <p className="font-semibold text-[var(--pl-heading)]">Assistant short response:</p>
                  <p>{submittedQuery ? 'Response area reserved for backend-integrated answer.' : 'Submit a query to view explainable output.'}</p>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr]">
              <SectionLabel text="NEXT ACTIONS CARD" />
              <div style={{ ...cardStyle, borderWidth: 1.5 }} className="p-4">
                <h5 className="text-[30px] font-semibold text-[var(--pl-heading)]">Next Actions</h5>
                <div className="mt-3 space-y-2">
                  {['Monitor trend', 'Check failure taxonomy', 'Review corridor health'].map((action) => (
                    <button
                      key={action}
                      className="w-full rounded-full border border-[var(--pl-border)] bg-white px-4 py-2 text-left text-[13px] text-[var(--pl-heading)] transition hover:border-[#B9B1A5]"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr]">
              <SectionLabel text="TRUST & SAFETY NOTICE" />
              <div className="rounded-xl border border-[var(--pl-border)] p-4" style={{ background: '#F0EEFA' }}>
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--pl-heading)]">Trust & Safety Notice</p>
                <p className="mt-2 text-[13px] leading-6 text-[var(--pl-text)]">
                  Privacy-safe output: sensitive identifiers and protected fields are never shown in UI.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="fixed bottom-0 right-0 z-40 h-[72px] left-0 lg:left-[220px]"
        style={{
          background: '#1A1D23',
          borderTop: isBarFocused ? '1px solid rgba(14,165,233,0.4)' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isBarFocused ? '0 -4px 32px rgba(14,165,233,0.12)' : '0 -4px 24px rgba(0,0,0,0.18)',
          transition: 'all 0.2s ease',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-6">
          <span className="text-[16px] text-[#6B7280]">✦</span>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsBarFocused(true)}
              onBlur={() => setIsBarFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitQuery()
                }
              }}
              placeholder="Ask Prompt Layer anything… e.g. Why is USD-MXN latency spiking?"
              className="w-full border-0 bg-transparent py-1 text-[14px] text-[#F9FAFB] outline-none placeholder:text-[#4B5563]"
              style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
            />
            <span
              className="absolute bottom-[-8px] left-0 block h-[1px] w-full origin-left bg-[#0EA5E9] transition-transform duration-200"
              style={{ transform: isBarFocused ? 'scaleX(1)' : 'scaleX(0)' }}
            />
          </div>
          <span
            className="rounded-md border px-2 py-0.5 text-[11px] text-[#6B7280]"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
          >
            ⌘K
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              submitQuery()
            }}
            disabled={query.trim().length === 0}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#0EA5E9' }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) e.currentTarget.style.background = '#0284C7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#0EA5E9'
              e.currentTarget.style.boxShadow = 'none'
            }}
            onMouseDown={(e) => {
              if (!e.currentTarget.disabled) e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.25)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Ask →
          </button>
        </div>
      </div>
    </div>
  )
}
