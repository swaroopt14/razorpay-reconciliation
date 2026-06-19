'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { JOURNAL_INSIGHT_DARK_LEGEND, JOURNAL_INSIGHT_DARK_MUTED } from '../command-center/homeCommandCenterTokens'

export type JournalMixLegendItem = {
  label: string
  value: string
  color: string
}

type JournalBatchMixCardBodyProps = {
  slices: Array<{ name: string; value: number }>
  legend: JournalMixLegendItem[]
  colors: string[]
  fillHeight?: boolean
  /** Beside gross value in black hero — horizontal chart + full legend. */
  embeddedInHero?: boolean
  formatValue?: (v: number) => string
}

/** Rail (~280px): chart on top, legend full width. Wider contexts: chart + legend side by side. */
export function JournalBatchMixCardBody({
  slices,
  legend,
  colors,
  fillHeight = false,
  embeddedInHero = false,
  formatValue = (v) => v.toLocaleString('en-US'),
}: JournalBatchMixCardBodyProps) {
  const chart = (
    <div
      className={
        embeddedInHero
          ? 'h-[176px] w-[176px] shrink-0'
          : fillHeight
            ? 'mx-auto h-[96px] w-[96px] shrink-0'
            : 'h-[132px] w-[132px] shrink-0'
      }
    >
      {slices.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={embeddedInHero ? 56 : fillHeight ? 30 : 40}
              outerRadius={embeddedInHero ? 80 : fillHeight ? 44 : 58}
              paddingAngle={3}
              cornerRadius={5}
              stroke="transparent"
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => formatValue(v)}
              labelStyle={{ color: '#ffffff' }}
              itemStyle={{ color: '#ffffff' }}
              contentStyle={{
                background: '#18181b',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 10,
                color: '#ffffff',
                fontSize: embeddedInHero ? 14 : 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p
          className={`flex h-full items-center justify-center text-center font-medium text-white ${
            embeddedInHero ? 'text-[24px]' : `text-[12px] ${JOURNAL_INSIGHT_DARK_MUTED}`
          }`}
        >
          No data
        </p>
      )}
    </div>
  )

  const legendList = (
    <ul
      className={
        embeddedInHero
          ? 'min-w-0 flex-1 space-y-3'
          : fillHeight
            ? 'w-full space-y-1.5'
            : 'min-w-0 flex-1 space-y-2'
      }
    >
      {legend.map((item) => (
        <li
          key={item.label}
          className={`flex items-start justify-between gap-2 ${
            embeddedInHero ? 'text-[24px] leading-snug' : fillHeight ? 'text-[11px] leading-snug' : 'text-[12px]'
          }`}
        >
          <span className={`flex min-w-0 flex-1 items-start ${embeddedInHero ? 'gap-2' : 'gap-1.5'}`}>
            <span
              className={`shrink-0 rounded-full ${embeddedInHero ? 'mt-2 h-3 w-3' : 'mt-1.5 h-1.5 w-1.5'}`}
              style={{ background: item.color }}
            />
            <span
              className={
                embeddedInHero
                  ? 'break-words font-medium text-white'
                  : `${JOURNAL_INSIGHT_DARK_LEGEND} ${fillHeight ? 'break-words' : 'truncate'}`
              }
            >
              {item.label}
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-white">{item.value}</span>
        </li>
      ))}
    </ul>
  )

  if (embeddedInHero) {
    return (
      <div className="flex items-center gap-6">
        {chart}
        {legendList}
      </div>
    )
  }

  if (fillHeight) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-1">
        {chart}
        {legendList}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 pb-4 pt-2">
      {chart}
      {legendList}
    </div>
  )
}
