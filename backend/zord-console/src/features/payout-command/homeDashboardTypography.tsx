'use client'

import type { ReactNode } from 'react'

/** Tabular numerals + superscript % (~55% size) for KPI-style deltas (e.g. chart tooltip chip). */
export function DashboardDeltaPercent({ value }: { value: number }) {
  const rounded = Math.round(value)
  const sign = rounded >= 0 ? '+' : '−'
  const n = Math.abs(rounded)
  return (
    <span className="inline-flex items-baseline gap-0 tabular-nums font-extrabold tracking-[-0.03em] text-[#000000]">
      <span>
        {sign}
        {n}
      </span>
      <sup className="ml-[0.02em] translate-y-[-0.08em] text-[0.55em] font-extrabold leading-none">%</sup>
    </span>
  )
}

/**
 * Large KPI line: if `text` ends with `%`, renders `%` as superscript; otherwise plain tabular display.
 * Use for command-center hero strings like `12,34%` or rupee amounts.
 */
export function HeroMetricWithSuperPercent({ text }: { text: string }) {
  if (text.endsWith('%')) {
    const head = text.slice(0, -1)
    return (
      <span className="tabular-nums font-extrabold tracking-[-0.03em] text-[#000000]">
        {head}
        <sup className="ml-[0.02em] translate-y-[-0.06em] text-[0.55em] font-extrabold leading-none">%</sup>
      </span>
    )
  }
  return <span className="tabular-nums font-extrabold tracking-[-0.03em] text-[#000000]">{text}</span>
}

/** Editorial emphasis: bold decimal percentages inside insight copy (same sentence, mixed weight). */
export function emphasizeInsightPercentages(text: string): ReactNode {
  const re = /(\d+(?:[.,]\d+)?%)/g
  const nodes: ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    const part = m[1]
    if (i > last) nodes.push(text.slice(last, i))
    nodes.push(
      <strong key={`p-${k++}`} className="font-extrabold text-[#000000]">
        {part}
      </strong>,
    )
    last = i + part.length
  }
  nodes.push(text.slice(last))
  return <>{nodes}</>
}
