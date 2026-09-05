'use client'

import { useState } from 'react'
import Link from 'next/link'

/* ================================================================
   Shared glass panel styles (reused as inline objects)
   ================================================================ */
const glass = {
  panel: {
    background: 'var(--glass-panel)',
    backdropFilter: 'blur(var(--glass-panel-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-panel-blur))',
    border: '1px solid var(--glass-border)',
    borderRadius: '16px',
    boxShadow: 'var(--glass-shadow-sm)',
  } as React.CSSProperties,
  divider: { borderBottom: '1px solid var(--glass-divider)' } as React.CSSProperties,
}

/* ================================================================
   SVG Success‑Rate Line Chart (main hero chart)
   ================================================================ */
const currentPeriod = [
  91.2, 90.8, 91.5, 92.1, 91.0, 92.4, 93.0, 91.8, 92.6, 91.4,
  93.2, 92.8, 91.6, 92.0, 93.5, 92.2, 91.9, 93.1, 92.7, 91.5,
  92.9, 93.4, 92.1, 93.0, 93.8, 92.6, 93.2, 94.1, 94.6, 98.7,
]
const previousPeriod = [
  89.8, 90.2, 89.5, 90.0, 90.8, 89.7, 90.4, 90.1, 89.9, 90.6,
  90.3, 89.8, 90.5, 90.2, 89.6, 90.7, 90.0, 90.4, 89.9, 90.3,
  90.1, 89.7, 90.5, 90.2, 90.8, 90.0, 90.6, 90.3, 90.1, 90.4,
]

function HeroChart() {
  const W = 900, H = 240
  const P = { t: 16, r: 44, b: 36, l: 12 }
  const cW = W - P.l - P.r, cH = H - P.t - P.b
  const all = [...currentPeriod, ...previousPeriod]
  const lo = Math.floor(Math.min(...all)) - 1
  const hi = Math.ceil(Math.max(...all)) + 1
  const x = (i: number) => P.l + (i / (currentPeriod.length - 1)) * cW
  const y = (v: number) => P.t + cH - ((v - lo) / (hi - lo)) * cH
  const smooth = (d: number[]) => {
    const pts = d.map((v, i) => ({ x: x(i), y: y(v) }))
    let p = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], e = pts[Math.min(pts.length - 1, i + 2)]
      p += ` C${(b.x + (c.x - a.x) / 6).toFixed(1)},${(b.y + (c.y - a.y) / 6).toFixed(1)} ${(c.x - (e.x - b.x) / 6).toFixed(1)},${(c.y - (e.y - b.y) / 6).toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`
    }
    return p
  }
  const grids = [85, 90, 95, 100].filter(v => v >= lo && v <= hi)
  const xL = ['Jan 11', 'Jan 18', 'Jan 26', 'Feb 3', 'Feb 10']

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px]" preserveAspectRatio="none">
      {grids.map(v => (
        <g key={v}>
          <line x1={P.l} y1={y(v)} x2={W - P.r} y2={y(v)} stroke="var(--glass-divider)" strokeWidth={1} />
          <text x={W - P.r + 6} y={y(v) + 4} fill="var(--glass-item-text)" fontSize="10" fontFamily="system-ui">{v}%</text>
        </g>
      ))}
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--cx-primary)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--cx-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${smooth(currentPeriod)} L${x(currentPeriod.length - 1).toFixed(1)},${y(lo).toFixed(1)} L${P.l},${y(lo).toFixed(1)} Z`} fill="url(#hg)" />
      <path d={smooth(previousPeriod)} fill="none" stroke="var(--glass-connector)" strokeWidth={1.5} strokeDasharray="5 4" />
      <path d={smooth(currentPeriod)} fill="none" stroke="var(--cx-primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(currentPeriod.length - 1)} cy={y(currentPeriod[currentPeriod.length - 1])} r={4} fill="var(--cx-primary)" stroke="white" strokeWidth={2} />
      {xL.map((l, i) => (
        <text key={l} x={P.l + (i / (xL.length - 1)) * cW} y={H - 8} fill="var(--glass-item-text)" fontSize="10" fontFamily="system-ui" textAnchor={i === 0 ? 'start' : i === xL.length - 1 ? 'end' : 'middle'}>{l}</text>
      ))}
    </svg>
  )
}

/* ================================================================
   Failure breakdown data
   ================================================================ */
const failures = [
  { name: 'Schema Invalid', count: 47 },
  { name: 'Auth Failure', count: 28 },
  { name: 'Provider Timeout', count: 23 },
  { name: 'Insufficient Funds', count: 19 },
  { name: 'Webhook Fail', count: 17 },
]
const maxFail = Math.max(...failures.map(f => f.count))
const barOpacities = [1, 0.75, 0.55, 0.40, 0.25]

/* ================================================================
   Action items
   ================================================================ */
const actions = [
  { title: '12 Webhook Deliveries Failed', desc: 'Endpoint /callback returned 503 - 45 min', severity: 'critical' as const, href: '/customer/integrations/webhooks' },
  { title: 'Schema Validation Spike', desc: '47 intents failed payment_v3 schema', severity: 'warning' as const, href: '/customer/intents' },
  { title: 'Recon Lag > 15 min', desc: 'Settlement file processing delayed', severity: 'warning' as const, href: '/customer/reports/settlement' },
  { title: '3 SLA Breaches (P95)', desc: 'Ack latency exceeded 450ms', severity: 'critical' as const, href: '/customer/exceptions' },
]

/* ================================================================
   KPI data
   ================================================================ */
const kpis = [
  { label: 'Success Rate', value: '98.7%', css: '--cx-primary', light: '--cx-primary-light' },
  { label: 'Total Intents', value: '14,892', css: '--cx-success', light: '--cx-success-light' },
  { label: 'Settled Volume', value: '₹1.24Cr', css: '--cx-primary', light: '--cx-primary-light' },
  { label: 'Failed Intents', value: '134', css: '--cx-energy', light: '--cx-energy-light' },
  { label: 'SLA Breaches', value: '3', css: '--cx-danger', light: '#FEF2F2' },
]

/* ================================================================
   Page
   ================================================================ */
export default function OpsOverviewPage() {
  const [range, setRange] = useState('24h')

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">

      {/* ── Hero Header ───────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--cx-primary)' }}>Live Overview</p>
          <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--glass-item-active)' }}>
            Good afternoon, AcmePay
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--glass-item-text)' }}>Here&apos;s how your payments are performing right now.</p>
        </div>
        <div className="flex items-center gap-2">
          {['1h', '6h', '24h', '7d', '30d'].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-3 py-1.5 text-xs font-semibold rounded-[10px] transition-all duration-[120ms]"
              style={range === r
                ? { background: 'var(--cx-primary)', color: '#fff', boxShadow: '0 2px 6px rgba(124,58,237,0.25)' }
                : { background: 'var(--glass-item-hover-bg)', color: 'var(--glass-item-text)', border: '1px solid var(--glass-border)' }}
            >
              {r}
            </button>
          ))}
          <button
            className="ml-1 flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-[120ms]"
            style={{ background: 'var(--glass-item-hover-bg)', color: 'var(--glass-item-text)', border: '1px solid var(--glass-border)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Export
          </button>
        </div>
      </div>

      {/* ── KPI Strip ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[16px] px-5 py-5 hover:-translate-y-0.5 transition-all duration-200 cursor-default"
            style={{
              background: `linear-gradient(135deg, var(${kpi.light}) 0%, var(--glass-panel) 100%)`,
              backdropFilter: 'blur(var(--glass-panel-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-panel-blur))',
              border: '1px solid var(--glass-border)',
              boxShadow: 'var(--glass-shadow-sm)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: `var(${kpi.css})` }} />
              <p className="text-xs font-medium" style={{ color: 'var(--glass-item-text)' }}>{kpi.label}</p>
            </div>
            <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: 'var(--glass-item-active)' }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main Grid: Chart + Actions ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Chart - 2 cols */}
        <div className="xl:col-span-2 overflow-hidden" style={glass.panel}>
          <div className="px-6 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--glass-item-active)' }}>Payment Success Rate</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--glass-item-text)' }}>30-day trend vs previous period</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-[3px] rounded" style={{ background: 'var(--cx-primary)' }} />
                <span className="text-[11px]" style={{ color: 'var(--glass-item-text)' }}>Current</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-[3px] rounded" style={{ background: 'var(--glass-connector)' }} />
                <span className="text-[11px]" style={{ color: 'var(--glass-item-text)' }}>Previous</span>
              </div>
            </div>
          </div>
          <div className="px-2">
            <HeroChart />
          </div>
        </div>

        {/* Action Required - 1 col */}
        <div className="flex flex-col" style={glass.panel}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--glass-item-active)' }}>Needs Attention</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--cx-danger)' }}>{actions.length} items</span>
          </div>
          <div className="flex-1">
            {actions.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="flex items-start gap-3 px-5 py-3.5 transition-all duration-[120ms] group"
                style={glass.divider}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-row-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.severity === 'critical' ? 'animate-pulse' : ''}`}
                  style={{ background: a.severity === 'critical' ? 'var(--cx-danger)' : 'var(--cx-energy)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--glass-item-active)' }}>{a.title}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--glass-item-text)' }}>{a.desc}</p>
                </div>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--cx-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </Link>
            ))}
          </div>
          <Link
            href="/customer/work-queue"
            className="block px-5 py-3 text-center text-xs font-semibold hover:opacity-80 transition-opacity"
            style={{ color: 'var(--cx-primary)', borderTop: '1px solid var(--glass-divider)', borderRadius: '0 0 16px 16px' }}
          >
            View all in Work Queue →
          </Link>
        </div>
      </div>

      {/* ── Bottom Grid: 3 panels ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Failure Breakdown */}
        <div className="p-5" style={glass.panel}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--glass-item-active)' }}>Top Failure Reasons</h3>
          <div className="space-y-3">
            {failures.map((f, idx) => (
              <div key={f.name} className="flex items-center gap-3">
                <span className="text-[13px] w-32 truncate" style={{ color: 'var(--glass-item-active)' }}>{f.name}</span>
                <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--glass-item-hover-bg)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(f.count / maxFail) * 100}%`, background: 'var(--cx-primary)', opacity: barOpacities[idx] }}
                  />
                </div>
                <span className="text-xs tabular-nums w-8 text-right font-medium" style={{ color: 'var(--glass-item-text)' }}>{f.count}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-4 pt-3" style={{ color: 'var(--glass-item-text)', borderTop: '1px solid var(--glass-divider)' }}>
            134 failures of 14,892 intents - <span className="font-semibold" style={{ color: 'var(--cx-success)' }}>99.1% success</span>
          </p>
        </div>

        {/* Recon & Settlement */}
        <div className="p-5" style={glass.panel}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--glass-item-active)' }}>Settlement & Recon</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-[10px] p-3.5" style={{ background: 'var(--glass-item-hover-bg)' }}>
              <p className="text-[11px] font-medium" style={{ color: 'var(--glass-item-text)' }}>Settled today</p>
              <p className="text-xl font-bold mt-0.5 tabular-nums" style={{ color: 'var(--glass-item-active)' }}>₹1.24Cr</p>
            </div>
            <div className="rounded-[10px] p-3.5" style={{ background: 'var(--glass-item-hover-bg)' }}>
              <p className="text-[11px] font-medium" style={{ color: 'var(--glass-item-text)' }}>Match rate</p>
              <p className="text-xl font-bold mt-0.5 tabular-nums" style={{ color: 'var(--glass-item-active)' }}>99.4%</p>
            </div>
          </div>
          <div className="space-y-0">
            {[
              { label: 'Avg finality', value: '8m 42s', status: 'ok' as const },
              { label: 'Refund lag', value: '12m 34s', status: 'warning' as const },
              { label: 'File processing', value: '15m 08s', status: 'critical' as const },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--glass-divider)' }}>
                <span className="text-[13px]" style={{ color: 'var(--glass-item-active)' }}>{r.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-mono font-medium tabular-nums" style={{ color: 'var(--glass-item-active)' }}>{r.value}</span>
                  <span
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ background: r.status === 'ok' ? 'var(--cx-success)' : r.status === 'warning' ? 'var(--cx-energy)' : 'var(--cx-danger)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evidence & SLA */}
        <div className="p-5" style={glass.panel}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--glass-item-active)' }}>Evidence & SLA</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-[10px] p-3.5" style={{ background: 'rgba(20,184,166,0.06)' }}>
              <p className="text-[11px] font-medium" style={{ color: 'var(--glass-item-text)' }}>Pack readiness</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--glass-item-active)' }}>97.2%</p>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--cx-success)' }}>+1.1%</span>
              </div>
            </div>
            <div className="rounded-[10px] p-3.5" style={{ background: 'rgba(249,115,22,0.06)' }}>
              <p className="text-[11px] font-medium" style={{ color: 'var(--glass-item-text)' }}>P95 ack latency</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--glass-item-active)' }}>480ms</p>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--cx-danger)' }}>+30ms</span>
              </div>
            </div>
          </div>
          <div className="space-y-0">
            {[
              { label: 'Evidence complete', value: '14,481', pct: '97.2%' },
              { label: 'Evidence pending', value: '382', pct: '2.6%' },
              { label: 'Evidence failed', value: '29', pct: '0.2%' },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--glass-divider)' }}>
                <span className="text-[13px]" style={{ color: 'var(--glass-item-active)' }}>{r.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-mono font-medium tabular-nums" style={{ color: 'var(--glass-item-active)' }}>{r.value}</span>
                  <span className="text-[11px] tabular-nums w-10 text-right" style={{ color: 'var(--glass-item-text)' }}>{r.pct}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-item-hover-bg)' }}>
            <div className="h-full rounded-full" style={{ width: '97.2%', background: 'var(--cx-success)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
