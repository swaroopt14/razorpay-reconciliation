'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LightCard, LiveDataHint, SurfaceEyebrow } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { fetchProdJsonGet } from '@/services/payout-command/prod-api/fetchProdJsonGet'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'

export function ProofSurface() {
  const { tenantReady } = useSessionTenant()
  const { ambiguity } = useIntelligenceKpis({ tenantReady })
  const ambData = isDataAvailable(ambiguity) ? ambiguity : null
  const [dlqCount, setDlqCount] = useState<number | null>(null)

  useEffect(() => {
    if (!tenantReady) {
      setDlqCount(null)
      return
    }
    void fetchProdJsonGet<{ items?: unknown[] }>('/api/prod/dlq?page=1&page_size=100').then((body) => {
      setDlqCount(body?.items?.length ?? 0)
    })
  }, [tenantReady])

  return (
    <div className="mt-8 space-y-4">
      <LiveDataHint isLive={Boolean(ambData)} source="intelligence" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LightCard className={`${COMMAND_CENTER_KPI_CARD} border-[#E5E5E5]`}>
          <SurfaceEyebrow>Ambiguous intents</SurfaceEyebrow>
          <div className={`mt-3 text-[2.5rem] font-light tracking-[-0.04em] ${HOME_TITLE_BLACK}`}>
            {ambData?.ambiguous_intent_count ?? '—'}
          </div>
          <div className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>From ambiguity KPI</div>
        </LightCard>

        <LightCard className={`${COMMAND_CENTER_KPI_CARD} border-[#E5E5E5]`}>
          <SurfaceEyebrow>Ambiguity rate</SurfaceEyebrow>
          <div className={`mt-3 text-[2.5rem] font-light tracking-[-0.04em] ${HOME_TITLE_BLACK}`}>
            {ambData?.ambiguity_rate != null ? `${(ambData.ambiguity_rate * 100).toFixed(2)}%` : '—'}
          </div>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Tenant ambiguity KPI</p>
        </LightCard>

        <LightCard className={`${COMMAND_CENTER_KPI_CARD} border-[#E5E5E5]`}>
          <SurfaceEyebrow>Value at risk</SurfaceEyebrow>
          <div className={`mt-3 text-[2rem] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
            {ambData?.value_at_risk_minor ?? '—'}
          </div>
          <p className={`mt-1 font-mono text-[11px] text-slate-500`}>value_at_risk_minor</p>
        </LightCard>

        <LightCard className={`${COMMAND_CENTER_KPI_CARD} border-[#E5E5E5]`}>
          <p className={COMMAND_CENTER_LABEL_GREEN}>DLQ / exceptions</p>
          <div className={`mt-3 text-[2.5rem] font-light tracking-[-0.04em] ${HOME_TITLE_BLACK}`}>
            {dlqCount != null ? dlqCount : '—'}
          </div>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>From GET /api/prod/dlq (intent-engine)</p>
        </LightCard>
      </div>

      <article className={COMMAND_CENTER_KPI_CARD}>
        <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>Triage ambiguous payouts</p>
        <p className={`mt-2 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>
          Use the Ambiguity dock for batch-level signals and the Evidence dock for pack-level proof. Exception ownership
          queues will appear here when upstream exposes them.
        </p>
        <Link
          href="/payout-command-view/today?dock=ambiguity"
          className="mt-4 inline-flex text-[14px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
        >
          Open ambiguity analysis →
        </Link>
      </article>
    </div>
  )
}
