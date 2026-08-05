'use client'

import { DM_Mono } from 'next/font/google'
import type { AmbiguityKpiResolved, LeakageKpiResolved, SignalClarityBand } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField } from '../../shared/formatApiKpiFields'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'
import { ZORD_SURFACE_MUTED } from '../../command-center/homeSurfaceFonts'
import { SIGNAL_CLARITY_COPY, signalClarityRollLabel } from '../copy/signalClarityCopy'
import {
  computeBandWidthPercents,
  displayBandHelper,
  displayBandLabel,
  displayBandRollLabel,
  formatBandAmount,
  formatBandLegendLine,
  mergeSignalClarityBands,
} from '../utils/signalClarityBandMapper'

type SignalClarityBarProps = {
  amb: AmbiguityKpiResolved | null
  leakage?: LeakageKpiResolved | null
  loading?: boolean
}

const SETTLEMENT_GREEN = '#22c55e'

const TONE_BG: Record<string, string> = {
  green: SETTLEMENT_GREEN,
  lime: '#525252',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
}

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

function bandTone(band: SignalClarityBand): string {
  if (band.tone && TONE_BG[band.tone]) return TONE_BG[band.tone]
  const label = band.band.toLowerCase()
  if (label === 'current' || label.includes('settlement') || label.includes('settled') || label.includes('exact')) {
    return TONE_BG.green
  }
  if (label.includes('sma-0') || label.includes('ambiguous') || label.includes('high')) return TONE_BG.lime
  if (label.includes('sma-1') || label.includes('variance')) return TONE_BG.amber
  if (label.includes('sma-2') || label.includes('reversal') || label.includes('missing')) return TONE_BG.orange
  if (label.includes('npa') || label.includes('unres') || label.includes('conflict')) return TONE_BG.red
  return '#94a3b8'
}

export function SignalClarityBar({ leakage, loading }: SignalClarityBarProps) {
  const bands = mergeSignalClarityBands(leakage ?? null)
  const widthPercents = computeBandWidthPercents(bands)
  const rollRates = [] as NonNullable<LeakageKpiResolved['segment_roll_rates']>
  const subtitle = loading ? '...' : '-'

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="signal-clarity-bar"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#22c55e] via-[#f59e0b] to-[#ef4444]" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>
            {SIGNAL_CLARITY_COPY.title}
          </h3>
          <p className={`mt-0.5 text-[14px] ${ZORD_SURFACE_MUTED}`}>{subtitle}</p>
        </div>
        {rollRates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {rollRates.map((roll) => (
              <span
                key={`${roll.from_band}-${roll.to_band}`}
                className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-[#475569] ${dmMono.className}`}
                title={signalClarityRollLabel(roll.from_band, roll.to_band)}
              >
                {signalClarityRollLabel(roll.from_band, roll.to_band)}{' '}
                {displayApiField(roll.roll_pct)}%
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex h-9 w-full overflow-hidden rounded-xl">
        {bands.map((band, index) => (
          <div
            key={band.band}
            title={`${displayBandLabel(band)}: ${formatBandAmount(band)}`}
            className="flex items-center justify-center transition hover:opacity-90"
            style={{
              width: `${widthPercents[index]}%`,
              minWidth: '36px',
              backgroundColor: bandTone(band),
            }}
          >
            <span className={`px-1 text-[11px] font-semibold text-white ${dmMono.className}`}>
              {formatBandAmount(band)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {bands.map((band) => {
          const rollLabel = displayBandRollLabel(band)
          const helper = displayBandHelper(band)
          return (
            <div
              key={`${band.band}-legend`}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: bandTone(band) }} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#000000]">{displayBandLabel(band)}</p>
                {helper ? (
                  <p className="text-[11px] font-medium text-slate-500">{helper}</p>
                ) : null}
                <p className={`text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>
                  {formatBandLegendLine(band)}
                </p>
                {rollLabel ? (
                  <p className={`mt-0.5 text-[11px] font-semibold text-slate-500 ${dmMono.className}`}>
                    {rollLabel}
                    {band.roll_pct != null && String(band.roll_pct).trim() !== ''
                      ? ` ${displayApiField(band.roll_pct)}%`
                      : ''}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
