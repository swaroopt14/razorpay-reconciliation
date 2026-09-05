'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { getAmbiguityMix } from '../utils/ambiguityApiMappers'

type Props = { amb: AmbiguityKpiResolved | null }

export function AmbiguityMixDonut({ amb }: Props) {
  const { segments, centerPct, colors } = getAmbiguityMix(amb)
  const hasData = segments.length > 0 && centerPct != null

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-black" />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#000000]">
            Ambiguity Mix
          </span>
        </div>
        <span
          className="rounded-full bg-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
        >
          Strategic
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center" style={{ minHeight: 200 }}>
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={segments}
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={88}
                  paddingAngle={3}
                  dataKey="pct"
                  nameKey="name"
                  strokeWidth={0}
                >
                  {segments.map((_, i) => (
                    <Cell key={i} fill={colors[i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[1.6rem] font-extrabold tabular-nums leading-none text-slate-900">
                {centerPct}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#00239C]">
                Clearing
              </p>
            </div>
          </>
        ) : (
          <p className="px-4 text-center text-[13px] font-medium text-[#00239C]">
            Mix not available. Backend should return{' '}
            <code className="text-[12px]">ambiguity_mix_segments</code> and{' '}
            <code className="text-[12px]">clearing_pct</code>.
          </p>
        )}
      </div>

      {hasData ? (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {segments.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                style={{ background: colors[i] }}
              />
              <span className="truncate text-[11px] font-medium text-slate-500">{d.name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
