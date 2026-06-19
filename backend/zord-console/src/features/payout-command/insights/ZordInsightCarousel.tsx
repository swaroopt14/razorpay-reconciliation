'use client'

import type { ReactNode, TouchEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import type { InsightDelta, ZordInsightCard } from './zordInsightCarouselTypes'
import { INTELLIGENCE_BLUE_GRADIENT } from '../command-center/homeCommandCenterTokens'

/** Home insight carousel — imperial blue glass; body copy is white for contrast on the gradient. */
const G = {
  grad: INTELLIGENCE_BLUE_GRADIENT,
  glow0: 'radial-gradient(ellipse at 72% 18%,rgba(255,255,255,0.52) 0%,transparent 62%)',
  glow1: 'radial-gradient(ellipse at 28% 75%,rgba(255,255,255,0.44) 0%,transparent 58%)',
  /** Primary type + chart stroke */
  dark: '#ffffff',
  /** Header label, icons, secondary emphasis */
  mid: 'rgba(255,255,255,0.92)',
  /** Captions, empty states, de-emphasized lines */
  muted: 'rgba(255,255,255,0.72)',
  pill: 'rgba(255,255,255,0.18)',
} as const

import { fmtInrFromMinorExact } from '../command-center/commandCenterFormat'

function fmtINR(n: number): string {
  return fmtInrFromMinorExact(n)
}

function BoltSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polygon
        points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        stroke={G.mid}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RupeeSvg() {
  return (
    <span className="text-[13px] font-bold leading-none" style={{ color: G.mid }} aria-hidden>
      ₹
    </span>
  )
}

function TrendSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline
        points="22 7 13.5 15.5 8.5 10.5 2 17"
        stroke={G.mid}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="16 7 22 7 22 13"
        stroke={G.mid}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AlertSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke={G.mid}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="12" y1="9" x2="12" y2="13" stroke={G.mid} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke={G.mid} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function ArrowSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="7" y1="17" x2="17" y2="7" stroke={G.mid} strokeWidth="2" strokeLinecap="round" />
      <polyline points="7 7 17 7 17 17" stroke={G.mid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ICON: Record<string, () => React.ReactElement> = {
  'account-insights': BoltSvg,
  'mismatch-value': RupeeSvg,
  'disbursement-trend': TrendSvg,
  leakage: AlertSvg,
}

function CardHeader({ label, id }: { label: string; id: string }) {
  const Icon = ICON[id] ?? BoltSvg
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon />
        <span className="text-[12.5px] font-medium tracking-[0.015em]" style={{ color: G.mid }}>
          {label}
        </span>
      </div>
      <ArrowSvg />
    </div>
  )
}

function DeltaPill({ delta }: { delta: InsightDelta }) {
  const arrow = delta.dir === 'up' ? '↑' : '↓'
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ color: G.dark, background: G.pill }}
    >
      {arrow}
      {delta.pct.toFixed(1)}% {delta.label}
    </span>
  )
}

function DotNav({ total, current, onDot }: { total: number; current: number; onDot: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to card ${i + 1}`}
          aria-current={i === current ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            onDot(i)
          }}
          className="h-[7px] rounded border-0 p-0 transition-[width,background] duration-300"
          style={{
            width: i === current ? 20 : 7,
            background: i === current ? '#ffffff' : 'rgba(255,255,255,0.28)',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  )
}

function boldNumbersAppear(text: string) {
  const key = 'numbers appear'
  const i = text.indexOf(key)
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <strong className="font-extrabold text-white">{key}</strong>
      {text.slice(i + key.length)}
    </>
  )
}

function InsightBody({ card }: { card: Extract<ZordInsightCard, { type: 'insight' }> }) {
  if (card.paragraph) {
    return (
      <div className="text-[20px] font-normal leading-[1.45] tracking-[0] text-white">
        {boldNumbersAppear(card.paragraph)}
      </div>
    )
  }
  return (
    <div className="text-[20px] font-light leading-[1.38] tracking-[-0.02em]" style={{ color: G.dark }}>
      {card.prefix ?? ''}{' '}
      <strong style={{ fontWeight: 700 }}>{card.highlight}</strong> {card.suffix ?? ''}
    </div>
  )
}

function MetricBody({ card }: { card: Extract<ZordInsightCard, { type: 'metric' }> }) {
  const headline = card.valueDisplay ?? fmtINR(card.valueRupee)
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-normal uppercase tracking-[0.06em]" style={{ color: G.muted }}>
        Total value
      </div>
      <div className="text-[42px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" style={{ color: G.dark }}>
        {headline}
      </div>
      <div className="mt-1.5 text-[12px]" style={{ color: G.mid }}>
        {card.subtext}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: G.pill, color: G.dark }}
        >
          {card.count} txns
        </span>
        <span className="text-[11px]" style={{ color: G.muted }}>
          {card.countLabel}
        </span>
      </div>
    </div>
  )
}

function TrendBody({ card }: { card: Extract<ZordInsightCard, { type: 'trend' }> }) {
  return (
    <>
      <div>
        <div className="mb-0.5 text-[11px] font-normal uppercase tracking-[0.06em]" style={{ color: G.muted }}>
          Current period
        </div>
        <div className="text-[30px] font-extrabold tabular-nums tracking-[-0.03em]" style={{ color: G.dark }}>
          {fmtINR(card.currentValueRupee)}
        </div>
      </div>
      <div className="mx-[-4px] mt-0.5 h-[52px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={card.spark}>
            <Line type="monotone" dataKey="v" stroke={G.dark} strokeWidth={2.2} dot={false} strokeOpacity={0.85} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function AlertBody({ card }: { card: Extract<ZordInsightCard, { type: 'alert' }> }) {
  return (
    <>
      <div>
        <div className="text-[38px] font-bold leading-none" style={{ color: G.dark }}>
          {card.count}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: G.mid }}>
          active patterns under review
        </div>
      </div>
      <div className="mt-2 rounded-[10px] px-3 py-2" style={{ background: G.pill }}>
        <div
          className="mb-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em]"
          style={{ color: G.muted }}
        >
          top pattern
        </div>
        <div className="text-[12.5px] font-bold" style={{ color: G.dark }}>
          {card.topPattern}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: G.mid }}>
          ~{fmtINR(card.exposureRupee)} estimated exposure
        </div>
      </div>
    </>
  )
}

function SkeletonBody() {
  const bar = (w: string, h: number) => (
    <div
      className="rounded-md bg-white/40"
      style={{ height: h, width: w, animation: 'zord-pulse 1.5s ease-in-out infinite' }}
      aria-hidden
    />
  )
  return (
    <div className="flex flex-col gap-2.5">
      {bar('50%', 14)}
      <div className="mt-1.5 flex flex-col gap-2">
        {bar('78%', 32)}
        {bar('60%', 12)}
        {bar('42%', 12)}
      </div>
      <div className="mt-1.5 h-5 w-[88px] rounded-full bg-white/40" style={{ animation: 'zord-pulse 1.5s ease-in-out infinite' }} aria-hidden />
      <style>{`
        @keyframes zord-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
      `}</style>
    </div>
  )
}

function EmptyBody() {
  const text =
    'No live trend or intelligence KPI payload yet for this workspace — numbers appear when leakage or patterns APIs return data.'
  return (
    <div className="text-[20px] font-normal leading-[1.45] tracking-[0]" style={{ color: G.muted }}>
      {boldNumbersAppear(text)}
    </div>
  )
}

function EmptyNoTenantBody() {
  return (
    <div className="text-[20px] font-normal leading-[1.45] tracking-[0]" style={{ color: G.muted }}>
      Sign in and select a workspace to populate intelligence cards from leakage and patterns APIs.
    </div>
  )
}

function GlassCard({
  card,
  index,
  isCurrent,
  isPeek,
  onClickCard,
  total,
  current,
  onDot,
  loading,
  empty,
  emptyNoTenant,
}: {
  card: ZordInsightCard | null
  index: number
  isCurrent: boolean
  isPeek: boolean
  onClickCard: (i: number) => void
  total: number
  current: number
  onDot: (i: number) => void
  loading: boolean
  empty: boolean
  emptyNoTenant: boolean
}) {
  let transform: string
  let opacity: number
  let zIndex: number

  if (isCurrent) {
    transform = 'translateX(0) scale(1)'
    opacity = 1
    zIndex = 3
  } else if (isPeek) {
    transform = 'translateX(86%) scale(0.92)'
    opacity = 0.6
    zIndex = 2
  } else {
    transform = 'translateX(110%) scale(0.86)'
    opacity = 0
    zIndex = 1
  }

  const glowBg = index % 2 === 0 ? G.glow0 : G.glow1
  const label = card?.label ?? 'Account Insights'
  const id = card?.id ?? 'account-insights'

  let body: ReactNode = null
  if (loading) body = <SkeletonBody />
  else if (emptyNoTenant) body = <EmptyNoTenantBody />
  else if (empty) body = <EmptyBody />
  else if (card) {
    switch (card.type) {
      case 'insight':
        body = <InsightBody card={card} />
        break
      case 'metric':
        body = <MetricBody card={card} />
        break
      case 'trend':
        body = <TrendBody card={card} />
        break
      case 'alert':
        body = <AlertBody card={card} />
        break
      default:
        body = null
    }
  }

  const showDelta = Boolean(!loading && !empty && !emptyNoTenant && card && 'delta' in card && card.delta)

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      className="absolute inset-0 select-none overflow-hidden rounded-[24px] transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ transform, opacity, zIndex, cursor: isCurrent || loading ? 'default' : 'pointer' }}
      onClick={() => {
        if (!isCurrent && !loading) onClickCard(index)
      }}
    >
      <div className="absolute inset-0 rounded-[24px]" style={{ background: G.grad }} aria-hidden />
      <div className="absolute inset-0 rounded-[24px]" style={{ background: glowBg }} aria-hidden />
      <div
        className="relative z-[1] box-border flex h-full flex-col justify-between px-5 py-[18px]"
        style={{ color: G.dark }}
      >
        <CardHeader label={label} id={id} />
        <div className="flex flex-1 flex-col justify-center gap-2.5 py-1">{body}</div>
        <div className="flex items-center justify-between gap-2">
          <DotNav total={total} current={current} onDot={onDot} />
          {showDelta && card && 'delta' in card && card.delta ? <DeltaPill delta={card.delta} /> : <span />}
        </div>
      </div>
    </div>
  )
}

export type ZordInsightCarouselProps = {
  tenantReady?: boolean
  autoplay?: boolean
  interval?: number
  loading?: boolean
  cards: ZordInsightCard[]
  onRefresh?: () => void
}

export function ZordInsightCarousel({
  tenantReady = true,
  autoplay = true,
  interval = 4000,
  loading = false,
  cards,
  onRefresh,
}: ZordInsightCarouselProps) {
  const [cur, setCur] = useState(0)
  const pauseRef = useRef(false)
  const touchStartX = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const total = loading ? 1 : Math.max(cards.length, 1)
  const isEmpty = Boolean(tenantReady && !loading && cards.length === 0)
  const emptyNoTenant = !tenantReady

  useEffect(() => {
    setCur(0)
  }, [cards, tenantReady])

  const goTo = useCallback(
    (i: number) => {
      const t = loading ? 1 : Math.max(cards.length, 1)
      setCur(Math.max(0, Math.min(i, Math.max(t - 1, 0))))
    },
    [cards.length, loading],
  )

  const next = useCallback(() => {
    setCur((c) => (c + 1) % total)
  }, [total])

  const prev = useCallback(() => {
    setCur((c) => (c - 1 + total) % total)
  }, [total])

  useEffect(() => {
    if (!autoplay || total < 2) return
    timerRef.current = setInterval(() => {
      if (!pauseRef.current) next()
    }, interval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoplay, interval, next, total])

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX
    pauseRef.current = true
  }

  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 44) {
      if (dx < 0) next()
      else prev()
    }
    touchStartX.current = null
    setTimeout(() => {
      pauseRef.current = false
    }, 800)
  }

  return (
    <div className="flex h-full min-h-[300px] w-full max-w-full flex-col">
      <div
        className="relative min-h-0 w-full min-w-0 flex-1 touch-pan-y"
        onMouseEnter={() => {
          pauseRef.current = true
        }}
        onMouseLeave={() => {
          pauseRef.current = false
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {!tenantReady ? (
          <GlassCard
            card={null}
            index={0}
            isCurrent
            isPeek={false}
            total={1}
            current={0}
            onClickCard={() => {}}
            onDot={() => {}}
            loading={false}
            empty={false}
            emptyNoTenant
          />
        ) : loading ? (
          <GlassCard
            card={null}
            index={0}
            isCurrent
            isPeek={false}
            total={1}
            current={0}
            onClickCard={() => {}}
            onDot={() => {}}
            loading
            empty={false}
            emptyNoTenant={false}
          />
        ) : isEmpty ? (
          <GlassCard
            card={null}
            index={0}
            isCurrent
            isPeek={false}
            total={1}
            current={0}
            onClickCard={() => {}}
            onDot={() => {}}
            loading={false}
            empty
            emptyNoTenant={false}
          />
        ) : (
          cards.map((card, i) => (
            <GlassCard
              key={card.id}
              card={card}
              index={i}
              isCurrent={i === cur}
              isPeek={i === (cur + 1) % total}
              onClickCard={goTo}
              total={total}
              current={cur}
              onDot={goTo}
              loading={false}
              empty={false}
              emptyNoTenant={false}
            />
          ))
        )}
      </div>

      {onRefresh ? (
        <button
          type="button"
          className="mt-2.5 border-0 bg-transparent text-[11px] tracking-[0.04em] text-[#bbb] hover:text-[#888]"
          onClick={onRefresh}
        >
          ↻ refresh
        </button>
      ) : null}
    </div>
  )
}
