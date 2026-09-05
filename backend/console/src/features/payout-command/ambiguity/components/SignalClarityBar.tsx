'use client'

import { Activity, GitBranch, Layers3 } from 'lucide-react'
import type { AmbiguityKpiResolved, SegmentRollRate, SignalClarityBand } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField, formatApiCount, formatApiMinorField } from '../../shared/formatApiKpiFields'

type SignalClarityBarProps = {
  amb: AmbiguityKpiResolved | null
  loading?: boolean
}

const TONE_STYLES: Record<string, { bar: string; soft: string; text: string }> = {
  green: { bar: '#0B1324', soft: 'bg-[#F1F5F9] border-[#0B1324]/15', text: 'text-[#0B1324]' },
  lime: { bar: '#84cc16', soft: 'bg-lime-50 border-lime-100', text: 'text-lime-700' },
  amber: { bar: '#0B1324', soft: 'bg-[#F1F5F9] border-[#0B1324]/15', text: 'text-[#0B1324]' },
  orange: { bar: '#0B1324', soft: 'bg-[#F1F5F9] border-[#0B1324]/20', text: 'text-[#0B1324]' },
  red: { bar: '#0B1324', soft: 'bg-[#F1F5F9] border-red-100', text: 'text-[#0B1324]' },
}

const DEFAULT_TONE = { bar: '#64748b', soft: 'bg-slate-50 border-slate-200', text: 'text-slate-600' }

function toneFor(band: SignalClarityBand) {
  return (band.tone && TONE_STYLES[band.tone]) || DEFAULT_TONE
}

function bandLabel(band: SignalClarityBand) {
  return band.range_label?.trim() || band.band
}

function rollLabel(roll: SegmentRollRate) {
  return `${roll.from_band} to ${roll.to_band}`
}

export function SignalClarityBar({ amb, loading }: SignalClarityBarProps) {
  const bands = amb?.signal_clarity_bands ?? []
  const rollRates = amb?.signal_clarity_roll_rates ?? []
  const hasShareRail = bands.length > 0 && bands.every((band) => band.share_pct != null)
  const subtitle = loading ? 'Loading signal clarity from intelligence API.' : amb?.signal_clarity_subtitle

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
      data-testid="signal-clarity-bar"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Signal clarity</p>
                <h3 className="mt-1 text-[1.2rem] font-semibold leading-tight text-slate-950">
                  Payment signal distribution
                </h3>
                {subtitle ? (
                  <p className="mt-1 max-w-[46rem] text-[13px] font-medium leading-relaxed text-slate-500">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase text-slate-500">
              API bands
            </span>
          </div>

          {bands.length > 0 ? (
            <>
              <div className="mt-5 overflow-hidden rounded-full bg-slate-100">
                <div className="flex h-4 min-w-full">
                  {hasShareRail
                    ? bands.map((band) => (
                        <span
                          key={band.band}
                          className="min-w-[12px]"
                          style={{ width: `${band.share_pct}%`, backgroundColor: toneFor(band).bar }}
                          title={`${bandLabel(band)}: ${displayApiField(band.share_pct)}%`}
                        />
                      ))
                    : (
                      <span className="h-4 w-full bg-slate-200" title="API did not return share percentages." />
                    )}
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {bands.map((band) => {
                  const tone = toneFor(band)
                  return (
                    <article
                      key={band.band}
                      className={`rounded-2xl border px-3 py-3 ${tone.soft}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900">{bandLabel(band)}</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {formatApiCount(band.item_count, loading)} items
                          </p>
                        </div>
                        <span className={`text-[12px] font-bold tabular-nums ${tone.text}`}>
                          {displayApiField(band.share_pct, loading)}%
                        </span>
                      </div>
                      <p className="mt-3 text-[1rem] font-semibold tabular-nums text-slate-950">
                        {formatApiMinorField(band.amount_minor, loading)}
                      </p>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-[13px] font-semibold text-slate-600">
                Signal clarity bands were not returned by the ambiguity API.
              </p>
            </div>
          )}
        </div>

        <aside className="border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-950 shadow-sm">
                <GitBranch className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Roll rates</p>
                <p className="text-[13px] font-semibold text-slate-950">Band movement</p>
              </div>
            </div>
            <Layers3 className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          <div className="mt-4 space-y-2">
            {rollRates.length > 0 ? (
              rollRates.map((roll) => (
                <div key={`${roll.from_band}-${roll.to_band}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-slate-700">{rollLabel(roll)}</p>
                    <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#0B1324]">
                      {displayApiField(roll.roll_pct, loading)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center">
                <p className="text-[12px] font-semibold text-slate-500">
                  Roll rates were not returned for this scope.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
