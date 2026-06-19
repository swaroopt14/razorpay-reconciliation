'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getAmbiguityKpis,
  getDefensibilityKpis,
  getLeakageKpis,
  getPatternsKpis,
  getRcaKpis,
  getRecommendationsKpis,
  type IntelligenceDateQuery,
} from './getIntelligenceKpis'
import type {
  AmbiguityKpiResponse,
  DefensibilityKpiResponse,
  LeakageKpiResponse,
  PatternsKpiResponse,
  RcaKpiResponse,
  RecommendationsKpiResponse,
} from './intelligenceTypes'
import { apiTrimmedString } from './coerceApiField'

export type IntelligenceKpis = {
  leakage: LeakageKpiResponse | null
  ambiguity: AmbiguityKpiResponse | null
  defensibility: DefensibilityKpiResponse | null
  patterns: PatternsKpiResponse | null
  recommendations: RecommendationsKpiResponse | null
  rca: RcaKpiResponse | null
  loading: boolean
  lastFetchedAt: Date | null
  refresh: () => Promise<void>
}

const DEFAULT_POLL_MS = 30_000

export type UseIntelligenceKpisOptions = {
  /** When true, polls BFF routes (tenant from session cookies). */
  tenantReady: boolean
  /** Optional — scopes patterns KPI to a batch; other KPIs are tenant-wide. */
  batchId?: string
  /** Optional date window forwarded to intelligence dashboards (from_date / to_date). */
  dateQuery?: IntelligenceDateQuery
  /** Set to 0 or less to load once without starting a polling interval. */
  intervalMs?: number
}

/**
 * Fans out intelligence dashboard KPIs and polls every `intervalMs` (default 30s).
 * Set `intervalMs` to 0 or less to fetch only once.
 * Does not require client `tenant_id` — BFF resolves tenant from session.
 */
export function useIntelligenceKpis(options: UseIntelligenceKpisOptions): IntelligenceKpis {
  const { tenantReady, batchId, dateQuery, intervalMs = DEFAULT_POLL_MS } = options
  const dateFrom = dateQuery?.from_date ?? ''
  const dateTo = dateQuery?.to_date ?? ''
  const normalizedDateQuery = useMemo(
    () => (dateFrom || dateTo ? { from_date: dateFrom, to_date: dateTo } : undefined),
    [dateFrom, dateTo],
  )

  const [leakage, setLeakage] = useState<LeakageKpiResponse | null>(null)
  const [ambiguity, setAmbiguity] = useState<AmbiguityKpiResponse | null>(null)
  const [defensibility, setDefensibility] = useState<DefensibilityKpiResponse | null>(null)
  const [patterns, setPatterns] = useState<PatternsKpiResponse | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationsKpiResponse | null>(null)
  const [rca, setRca] = useState<RcaKpiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) return
    setLoading(true)
    try {
      const [lk, am, df, pt, rc, rcaRes] = await Promise.all([
        getLeakageKpis(normalizedDateQuery, apiTrimmedString(batchId) || undefined),
        getAmbiguityKpis(normalizedDateQuery, apiTrimmedString(batchId) || undefined),
        getDefensibilityKpis(normalizedDateQuery),
        getPatternsKpis(apiTrimmedString(batchId) || undefined),
        getRecommendationsKpis(normalizedDateQuery),
        getRcaKpis(normalizedDateQuery),
      ])
      if (cancelledRef.current) return
      setLeakage(lk)
      setAmbiguity(am)
      setDefensibility(df)
      setPatterns(pt)
      setRecommendations(rc)
      setRca(rcaRes)
      setLastFetchedAt(new Date())
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [tenantReady, batchId, normalizedDateQuery])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) {
      setLeakage(null)
      setAmbiguity(null)
      setDefensibility(null)
      setPatterns(null)
      setRecommendations(null)
      setRca(null)
      return
    }
    void refresh()
    if (intervalMs <= 0) {
      return () => {
        cancelledRef.current = true
      }
    }
    const id = window.setInterval(() => {
      void refresh()
    }, intervalMs)
    return () => {
      cancelledRef.current = true
      window.clearInterval(id)
    }
  }, [tenantReady, refresh, intervalMs])

  return { leakage, ambiguity, defensibility, patterns, recommendations, rca, loading, lastFetchedAt, refresh }
}
