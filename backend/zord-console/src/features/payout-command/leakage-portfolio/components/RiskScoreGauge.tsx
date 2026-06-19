'use client'

import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { deriveRiskScore } from '../utils/deriveRiskScore'

type RiskScoreGaugeProps = {
  data: PortfolioLeakageViewModel
  defensibility: DefensibilityKpiResolved | null
}

export function RiskScoreGauge({ data, defensibility }: RiskScoreGaugeProps) {
  const score = deriveRiskScore(data, defensibility)
  const pct = score / 100
  const angle = 180 * pct

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-[14px] font-semibold text-slate-700">Risk Score</h2>

      <div className="relative mx-auto mt-4 flex flex-1 flex-col items-center justify-center">
        <svg
          viewBox="0 0 200 120"
          className="w-full max-w-[220px]"
          role="img"
          aria-label={`Risk score ${score} out of 100`}
        >
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 251} 251`}
          />
          <circle
            cx={100 + 80 * Math.cos(Math.PI - (angle * Math.PI) / 180)}
            cy={100 - 80 * Math.sin(Math.PI - (angle * Math.PI) / 180)}
            r="10"
            fill="#f1f5f9"
            stroke="#1e293b"
            strokeWidth="4"
          />
        </svg>

        <div className="absolute bottom-6 text-center">
          <p className="text-[2.5rem] font-bold tabular-nums leading-none text-slate-900">
            {score}
            <span className="text-[1.25rem] font-medium text-slate-500"> / 100</span>
          </p>
        </div>
      </div>
    </article>
  )
}
