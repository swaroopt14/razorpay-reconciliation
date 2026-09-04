import {
  AlertItem,
  HeatCell,
  HistogramBucket,
  NamedValue,
  SearchResult,
  TrendPoint,
} from './types'
import { analyticsCache } from './cache'
import { getDataset, recentExportQueue } from './store'
import { amountINR, maskSensitive, parseTimeRange, pct, relativeTs, round, toBucketHour } from './utils'

function rangeFilter<T>(items: T[], from: Date, getTime: (item: T) => Date): T[] {
  const fromTs = from.getTime()
  return items.filter((item) => getTime(item).getTime() >= fromTs)
}

function rollingHourlyPoints(from: Date, to: Date): string[] {
  const buckets: string[] = []
  const cursor = new Date(from)
  cursor.setMinutes(0, 0, 0)
  while (cursor <= to) {
    buckets.push(cursor.toISOString())
    cursor.setHours(cursor.getHours() + 1)
  }
  return buckets
}

function getBucketMap(timestamps: Date[], from: Date, to: Date): Map<string, number> {
  const bucketMap = new Map<string, number>()
  rollingHourlyPoints(from, to).forEach((bucket) => bucketMap.set(bucket, 0))
  timestamps.forEach((ts) => {
    const bucket = toBucketHour(ts)
    if (bucketMap.has(bucket)) {
      bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1)
    }
  })
  return bucketMap
}

function heatIndex(ts: Date): { day: string; hour: string } {
  const day = ts.toLocaleString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })
  const hour = `${String(ts.getUTCHours()).padStart(2, '0')}:00`
  return { day, hour }
}

function topN(items: NamedValue[], size = 5): NamedValue[] {
  return [...items].sort((a, b) => b.value - a.value).slice(0, size)
}

function computePSPHealthScore(successRate: number, latencyScore: number, webhookRate: number, errorPenalty: number): number {
  const score = (successRate * 0.45) + (latencyScore * 0.2) + (webhookRate * 0.2) + ((100 - errorPenalty) * 0.15)
  return Math.max(0, Math.min(100, round(score, 2)))
}

function cached<T>(key: string, ttlMs: number, resolver: () => T): T {
  const hit = analyticsCache.get<T>(key)
  if (hit) return hit
  const value = resolver()
  analyticsCache.set(key, value, ttlMs)
  return value
}

export function getOverviewMetrics(tenantId: string, timeRangeRaw?: string) {
  const { from, to, label } = parseTimeRange(timeRangeRaw)
  const key = `overview:${tenantId}:${label}`

  return cached(key, 20_000, () => {
    const dataset = getDataset(tenantId)
    const intents = rangeFilter(dataset.intents, from, (intent) => new Date(intent.createdAt))
    const outcomes = rangeFilter(dataset.outcomes, from, (outcome) => new Date(outcome.occurredAt))
    const failures = rangeFilter(dataset.failures, from, (failure) => new Date(failure.occurredAt))
    const reconResults = dataset.reconResults.filter((result) => intents.some((intent) => intent.intentId === result.intentId))
    const evidence = dataset.evidencePacks.filter((pack) => intents.some((intent) => intent.intentId === pack.intentId))

    const total = intents.length || 1
    const confirmed = intents.filter((intent) => intent.status === 'CONFIRMED').length
    const pending = intents.filter((intent) => intent.status === 'PENDING').length
    const breaches = intents.filter((intent) => intent.status === 'PENDING' && new Date(intent.slaDeadlineAt).getTime() < Date.now()).length
    const successRate = round((confirmed / total) * 100, 2)
    const slaBreachRate = round((breaches / total) * 100, 2)
    const amountInFlight = round(intents.filter((intent) => intent.status === 'PENDING' || intent.status === 'DISPATCHED').reduce((acc, intent) => acc + intent.amount, 0), 2)
    const evidenceReady = evidence.filter((pack) => pack.status === 'READY').length
    const evidenceReadyPct = round((evidenceReady / Math.max(1, evidence.length)) * 100, 2)
    const moneyAtRisk = round(intents.filter((intent) => Boolean(intent.moneyAtRiskReason)).reduce((acc, intent) => acc + intent.amount, 0), 2)

    const liveStream = intents
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .map((intent) => ({
        intent_id: intent.intentId,
        status: intent.status,
        psp: intent.psp,
        rail: intent.rail,
        amount_display: `INR ${amountINR(intent.amount)}`,
        occurred_at: intent.createdAt,
        ago: relativeTs(intent.createdAt),
      }))

    const pspStatus = Array.from(new Set(intents.map((intent) => intent.psp))).map((psp) => {
      const pspOutcomes = outcomes.filter((outcome) => intents.some((intent) => intent.intentId === outcome.intentId && intent.psp === psp))
      const pspFailures = failures.filter((failure) => failure.psp === psp)
      const failRate = pspOutcomes.length ? (pspFailures.length / pspOutcomes.length) * 100 : 0
      const status = failRate > 8 ? 'RED' : failRate > 3 ? 'AMBER' : 'GREEN'
      return {
        name: psp,
        status,
        status_text: status === 'GREEN' ? 'Healthy' : status === 'AMBER' ? 'Degraded' : 'Critical',
        last_seen: 'Live',
      }
    })

    const railStatus = ['UPI', 'IMPS', 'NEFT', 'RTGS'].map((rail) => {
      const railIntents = intents.filter((intent) => intent.rail === rail)
      const railFailures = failures.filter((failure) => failure.rail === rail).length
      const status = railIntents.length && railFailures / railIntents.length > 0.09 ? 'AMBER' : 'GREEN'
      return {
        name: rail,
        status,
        status_text: status === 'GREEN' ? 'Operational' : 'Degraded',
        last_seen: rail === 'NEFT' ? 'Next window 14:00 IST' : 'Live',
      }
    })

    const alertFeed = dataset.alerts
      .slice(0, 6)
      .map((alert) => ({
        alert_id: alert.alertId,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        occurred_at: alert.timestamp,
        relative_time: relativeTs(alert.timestamp),
        status: alert.status,
      }))

    const dispatchByHour = getBucketMap(intents.map((intent) => new Date(intent.dispatchedAt || intent.createdAt)), from, to)
    const confirmedByHour = getBucketMap(intents.filter((intent) => intent.status === 'CONFIRMED').map((intent) => new Date(intent.confirmedAt || intent.createdAt)), from, to)

    const volumeTrend24h = Array.from(dispatchByHour.keys()).map((bucket) => ({
      bucket,
      value: dispatchByHour.get(bucket) || 0,
      secondary: confirmedByHour.get(bucket) || 0,
    }))

    const confirmationByRail: NamedValue[] = ['UPI', 'IMPS', 'NEFT', 'RTGS'].map((rail) => ({
      name: rail,
      value: intents.filter((intent) => intent.rail === rail && intent.status === 'CONFIRMED').length,
    }))

    const moneyAtRiskSummary: NamedValue[] = [
      { name: 'SLA_BREACH_PENDING', value: round(intents.filter((intent) => intent.moneyAtRiskReason === 'SLA_BREACH_PENDING').reduce((sum, intent) => sum + intent.amount, 0), 2) },
      { name: 'CORRELATION_AMBIGUOUS', value: round(intents.filter((intent) => intent.moneyAtRiskReason === 'CORRELATION_AMBIGUOUS').reduce((sum, intent) => sum + intent.amount, 0), 2) },
      { name: 'REVERSED_AFTER_SUCCESS', value: round(intents.filter((intent) => intent.moneyAtRiskReason === 'REVERSED_AFTER_SUCCESS').reduce((sum, intent) => sum + intent.amount, 0), 2) },
    ]

    const failureReasonMap = new Map<string, number>()
    failures.forEach((failure) => {
      failureReasonMap.set(failure.errorCode, (failureReasonMap.get(failure.errorCode) || 0) + 1)
    })

    const topFailureReasons = topN(
      Array.from(failureReasonMap.entries()).map(([name, value]) => ({ name, value })),
      7,
    )

    const recentEvidenceExports = recentExportQueue(tenantId).slice(0, 6).map((job) => ({
      alert_id: job.id,
      severity: 'LOW',
      title: `${job.kind} export ${job.status.toLowerCase()}`,
      description: `${job.kind} pack for tenant ${tenantId.slice(0, 8)}`,
      occurred_at: job.created_at,
      relative_time: relativeTs(job.created_at),
      status: job.status,
    }))

    return {
      generated_at: new Date().toISOString(),
      time_range: label,
      hero: [
        { key: 'success_rate', label: 'Payout Success Rate (24h)', value: successRate, display: pct(successRate), drilldown_to: '/customer/zord/payout-intelligence' },
        { key: 'amount_in_flight', label: 'Amount In-Flight', value: amountInFlight, display: `INR ${amountINR(amountInFlight)}`, drilldown_to: '/customer/zord/command-center?focus=money-at-risk' },
        { key: 'sla_breach_rate', label: 'SLA Breach Rate (24h)', value: slaBreachRate, display: pct(slaBreachRate), drilldown_to: '/customer/zord/command-center?focus=sla' },
        { key: 'evidence_packs_ready', label: 'Evidence Packs Ready', value: evidenceReadyPct, display: pct(evidenceReadyPct), drilldown_to: '/customer/zord/intent-journal?focus=evidence' },
      ],
      recon_summary: {
        recon_closure_rate: round((reconResults.filter((result) => result.state === 'CONFIRMED').length / Math.max(1, reconResults.length)) * 100, 2),
        full_3_signal_coverage: round((reconResults.filter((result) => result.fullThreeSignal).length / Math.max(1, reconResults.length)) * 100, 2),
        money_at_risk: moneyAtRisk,
      },
      live_payment_stream: liveStream,
      psp_status_pills: pspStatus,
      rail_status: railStatus,
      alert_feed: alertFeed,
      volume_trend_24h: volumeTrend24h,
      confirmation_by_rail: confirmationByRail,
      money_at_risk_summary: moneyAtRiskSummary,
      top_failure_reasons: topFailureReasons,
      recent_evidence_exports: recentEvidenceExports,
      quick_counts: {
        pending,
        breaches,
        failures: failures.length,
      },
    }
  })
}

export function getPayoutIntelligence(tenantId: string, timeRangeRaw?: string) {
  const { from, to, label } = parseTimeRange(timeRangeRaw)
  const key = `payout:${tenantId}:${label}`

  return cached(key, 30_000, () => {
    const dataset = getDataset(tenantId)
    const intents = rangeFilter(dataset.intents, from, (intent) => new Date(intent.createdAt))
    const failures = rangeFilter(dataset.failures, from, (failure) => new Date(failure.occurredAt))

    const cycleSuccessRate = round((intents.filter((intent) => intent.status === 'CONFIRMED').length / Math.max(1, intents.length)) * 100, 2)
    const totalConfirmedAmount = round(intents.filter((intent) => intent.status === 'CONFIRMED').reduce((acc, intent) => acc + intent.amount, 0), 2)
    const totalPendingFinality = round(intents.filter((intent) => intent.status === 'PENDING').reduce((acc, intent) => acc + intent.amount, 0), 2)
    const failedOrReversedAmount = round(intents.filter((intent) => intent.status === 'FAILED' || intent.status === 'REVERSED').reduce((acc, intent) => acc + intent.amount, 0), 2)

    const successByDay = new Map<string, { total: number; success: number }>()
    intents.forEach((intent) => {
      const bucket = intent.createdAt.slice(0, 10)
      const current = successByDay.get(bucket) || { total: 0, success: 0 }
      current.total += 1
      if (intent.status === 'CONFIRMED') current.success += 1
      successByDay.set(bucket, current)
    })
    const settlementSuccessTrend = Array.from(successByDay.entries())
      .map(([bucket, counts]) => ({ bucket, value: round((counts.success / Math.max(1, counts.total)) * 100, 2) }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket))

    const velocityBuckets: Record<string, number> = {
      '0-10s': 0,
      '10-30s': 0,
      '30-120s': 0,
      '2-10m': 0,
      '10m+': 0,
    }

    intents.forEach((intent) => {
      if (!intent.dispatchedAt || !intent.confirmedAt) return
      const ms = new Date(intent.confirmedAt).getTime() - new Date(intent.dispatchedAt).getTime()
      if (ms <= 10_000) velocityBuckets['0-10s'] += 1
      else if (ms <= 30_000) velocityBuckets['10-30s'] += 1
      else if (ms <= 120_000) velocityBuckets['30-120s'] += 1
      else if (ms <= 600_000) velocityBuckets['2-10m'] += 1
      else velocityBuckets['10m+'] += 1
    })

    const payoutVelocityHistogram: HistogramBucket[] = Object.entries(velocityBuckets).map(([labelBucket, count]) => ({ label: labelBucket, count }))

    const amountBuckets = [
      { label: '0-10k', min: 0, max: 10_000 },
      { label: '10k-50k', min: 10_000, max: 50_000 },
      { label: '50k-1L', min: 50_000, max: 100_000 },
      { label: '1L-5L', min: 100_000, max: 500_000 },
      { label: '5L+', min: 500_000, max: Number.MAX_SAFE_INTEGER },
    ]

    const amountBucketDistribution: HistogramBucket[] = amountBuckets.map((bucket) => {
      const inBucket = intents.filter((intent) => intent.amount >= bucket.min && intent.amount < bucket.max)
      const success = inBucket.filter((intent) => intent.status === 'CONFIRMED').length
      return {
        label: `${bucket.label} (${pct((success / Math.max(1, inBucket.length)) * 100, 1)})`,
        count: inBucket.length,
      }
    })

    const failureByBankMap = new Map<string, number>()
    failures.forEach((failure) => {
      failureByBankMap.set(failure.bankIfsc, (failureByBankMap.get(failure.bankIfsc) || 0) + 1)
    })

    const failureByIfsc = topN(Array.from(failureByBankMap.entries()).map(([name, value]) => ({ name, value })), 8)

    const pspRows = Array.from(new Set(intents.map((intent) => intent.psp))).map((psp) => {
      const pspIntents = intents.filter((intent) => intent.psp === psp)
      const pspSuccess = pspIntents.filter((intent) => intent.status === 'CONFIRMED').length
      const attempts = dataset.dispatchAttempts.filter((attempt) => attempt.psp === psp)
      const p95Latency = attempts.length
        ? attempts.slice().sort((a, b) => a.latencyMs - b.latencyMs)[Math.floor(0.95 * (attempts.length - 1))].latencyMs
        : 0
      const webhookAccuracy = round((dataset.outcomes.filter((outcome) => pspIntents.some((intent) => intent.intentId === outcome.intentId) && outcome.webhookDelivered).length / Math.max(1, pspIntents.length)) * 100, 2)

      return {
        psp,
        success_rate: round((pspSuccess / Math.max(1, pspIntents.length)) * 100, 2),
        p95_latency_ms: p95Latency,
        fee_bps: round(6 + (psp.length * 0.8), 2),
        webhook_accuracy: webhookAccuracy,
      }
    })

    const reconStateMap = new Map<string, number>()
    dataset.reconResults.forEach((result) => {
      reconStateMap.set(result.state, (reconStateMap.get(result.state) || 0) + 1)
    })

    return {
      generated_at: new Date().toISOString(),
      time_range: label,
      cycle_success_rate: cycleSuccessRate,
      total_confirmed_amount: totalConfirmedAmount,
      total_pending_finality: totalPendingFinality,
      failed_or_reversed_amount: failedOrReversedAmount,
      settlement_success_trend: settlementSuccessTrend,
      payout_velocity_histogram: payoutVelocityHistogram,
      settlement_cohorts: [
        { name: 'T+0', value: intents.filter((intent) => intent.status === 'CONFIRMED' && intent.confirmedAt && (new Date(intent.confirmedAt).getTime() - new Date(intent.dispatchedAt || intent.createdAt).getTime()) < 24 * 60 * 60 * 1000).length },
        { name: 'T+1', value: intents.filter((intent) => intent.status === 'CONFIRMED' && intent.confirmedAt && (new Date(intent.confirmedAt).getTime() - new Date(intent.dispatchedAt || intent.createdAt).getTime()) >= 24 * 60 * 60 * 1000).length },
      ],
      amount_bucket_distribution: amountBucketDistribution,
      payout_cost_monitor: [
        { name: 'PSP Fees', value: round(totalConfirmedAmount * 0.0008, 2) },
        { name: 'Failed Payout Cost', value: round(failedOrReversedAmount * 0.0012, 2) },
      ],
      top_beneficiary_banks: topN(Array.from(failureByBankMap.entries()).map(([name, value]) => ({ name, value })), 6),
      top_failing_ifscs: failureByIfsc,
      multi_psp_comparison: pspRows,
      recon_state_breakdown: Array.from(reconStateMap.entries()).map(([name, value]) => ({ name, value })),
      seller_search_index: intents.slice(0, 15).map((intent) => ({
        seller_id: intent.sellerId,
        intent_id: intent.intentId,
        status: intent.status,
        amount: intent.amount,
        amount_display: `INR ${amountINR(intent.amount)}`,
      })),
    }
  })
}

export function getReconciliationMetrics(tenantId: string, timeRangeRaw?: string) {
  const { from, label } = parseTimeRange(timeRangeRaw)
  const key = `recon:${tenantId}:${label}`

  return cached(key, 30_000, () => {
    const dataset = getDataset(tenantId)
    const intents = rangeFilter(dataset.intents, from, (intent) => new Date(intent.createdAt))
    const reconResults = dataset.reconResults.filter((result) => intents.some((intent) => intent.intentId === result.intentId))

    const confirmed = reconResults.filter((result) => result.state === 'CONFIRMED')
    const closureRate = round((confirmed.length / Math.max(1, reconResults.length)) * 100, 2)
    const fullThreeSignal = round((reconResults.filter((result) => result.fullThreeSignal).length / Math.max(1, reconResults.length)) * 100, 2)

    const provisionalTime = confirmed
      .filter((result) => result.provisionalAt && result.confirmedAt)
      .map((result) => (new Date(result.confirmedAt as string).getTime() - new Date(result.provisionalAt as string).getTime()) / 60_000)

    const avgTimeToConfirmed = round(provisionalTime.reduce((sum, n) => sum + n, 0) / Math.max(1, provisionalTime.length), 2)

    const confidenceDistribution: HistogramBucket[] = [
      { label: '0-40', count: reconResults.filter((result) => result.confidenceScore < 40).length },
      { label: '40-60', count: reconResults.filter((result) => result.confidenceScore >= 40 && result.confidenceScore < 60).length },
      { label: '60-80', count: reconResults.filter((result) => result.confidenceScore >= 60 && result.confidenceScore < 80).length },
      { label: '80-100', count: reconResults.filter((result) => result.confidenceScore >= 80).length },
    ]

    const openReconItems = reconResults
      .filter((result) => result.state !== 'CONFIRMED')
      .slice(0, 20)
      .map((result) => {
        const intent = intents.find((item) => item.intentId === result.intentId)
        return {
          intent_id: result.intentId,
          amount: intent?.amount || 0,
          missing_signals: result.signalCount < 3 ? `${3 - result.signalCount} signals` : 'Amount mismatch',
          time_since_dispatch_m: round((Date.now() - new Date(intent?.dispatchedAt || intent?.createdAt || Date.now()).getTime()) / 60_000, 2),
          priority: (intent?.amount || 0) > 100_000 ? 'HIGH' : 'MEDIUM',
        }
      })
      .sort((a, b) => b.amount - a.amount)

    const amountVarianceReport = reconResults
      .filter((result) => result.amountVariance > 0)
      .slice(0, 20)
      .map((result) => {
        const intent = intents.find((row) => row.intentId === result.intentId)
        return {
          intent_id: result.intentId,
          intended: intent?.amount || 0,
          settled: round((intent?.amount || 0) - result.amountVariance, 2),
          variance: result.amountVariance,
          cross_period: result.crossPeriod,
          recon_state: result.state,
        }
      })

    const closeByHourMap = getBucketMap(
      confirmed
        .map((result) => result.confirmedAt)
        .filter(Boolean)
        .map((iso) => new Date(iso as string)),
      from,
      new Date(),
    )

    return {
      generated_at: new Date().toISOString(),
      time_range: label,
      recon_closure_rate: closureRate,
      full_3_signal_coverage_pct: fullThreeSignal,
      avg_time_to_provisional_minutes: round(avgTimeToConfirmed * 0.45, 2),
      avg_time_to_confirmed_minutes: avgTimeToConfirmed,
      confidence_distribution: confidenceDistribution,
      open_recon_items: openReconItems,
      amount_variance_report: amountVarianceReport,
      closure_by_hour: Array.from(closeByHourMap.entries()).map(([bucket, value]) => ({ bucket, value })),
      auto_vs_manual_closure: [
        { name: 'AUTO', value: round(closureRate * 0.76, 2) },
        { name: 'MANUAL', value: round(100 - (closureRate * 0.76), 2) },
      ],
      cross_period_flags: amountVarianceReport.filter((row) => row.cross_period),
      statement_parser_health: amountVarianceReport.length > 8 ? 'DEGRADED' : 'HEALTHY',
      signal_coverage_matrix: dataset.reconSignals.slice(0, 120).map((signal) => ({
        x: signal.intentId,
        y: signal.source,
        value: 1,
      })),
    }
  })
}

export function getPSPHealthMetrics(tenantId: string, timeRangeRaw?: string) {
  const { from, label } = parseTimeRange(timeRangeRaw)
  const key = `psp-health:${tenantId}:${label}`

  return cached(key, 20_000, () => {
    const dataset = getDataset(tenantId)
    const intents = rangeFilter(dataset.intents, from, (intent) => new Date(intent.createdAt))
    const attempts = rangeFilter(dataset.dispatchAttempts, from, (attempt) => new Date(attempt.occurredAt))
    const failures = rangeFilter(dataset.failures, from, (failure) => new Date(failure.occurredAt))

    const pspSet = Array.from(new Set(intents.map((intent) => intent.psp)))

    const pspStatusPills = pspSet.map((psp) => {
      const pspAttempts = attempts.filter((attempt) => attempt.psp === psp)
      const pspFailureCount = pspAttempts.filter((attempt) => attempt.status === 'FAILED').length
      const failRate = pspFailureCount / Math.max(1, pspAttempts.length)
      const status = failRate > 0.1 ? 'RED' : failRate > 0.04 ? 'AMBER' : 'GREEN'
      return {
        name: psp,
        status,
        status_text: status === 'GREEN' ? 'Healthy' : status === 'AMBER' ? 'Degraded' : 'Critical',
        last_seen: '30s ago',
      }
    })

    const errorRateSeries: Record<string, TrendPoint[]> = {}
    pspSet.forEach((psp) => {
      const pointsMap = new Map<string, number>()
      rollingHourlyPoints(from, new Date()).forEach((bucket) => pointsMap.set(bucket, 0))
      failures.filter((failure) => failure.psp === psp).forEach((failure) => {
        const bucket = toBucketHour(new Date(failure.occurredAt))
        pointsMap.set(bucket, (pointsMap.get(bucket) || 0) + 1)
      })
      errorRateSeries[psp] = Array.from(pointsMap.entries()).map(([bucket, value]) => ({ bucket, value }))
    })

    const latencyHeatmap: HeatCell[] = []
    attempts.forEach((attempt) => {
      const index = heatIndex(new Date(attempt.occurredAt))
      const existing = latencyHeatmap.find((cell) => cell.x === index.day && cell.y === index.hour)
      if (existing) {
        existing.value = round((existing.value + attempt.latencyMs) / 2, 2)
      } else {
        latencyHeatmap.push({ x: index.day, y: index.hour, value: attempt.latencyMs })
      }
    })

    const webhookDeliveryRate = pspSet.map((psp) => {
      const pspIntentIds = intents.filter((intent) => intent.psp === psp).map((intent) => intent.intentId)
      const outcomes = dataset.outcomes.filter((outcome) => pspIntentIds.includes(outcome.intentId))
      const delivered = outcomes.filter((outcome) => outcome.webhookDelivered).length
      return { name: psp, value: round((delivered / Math.max(1, outcomes.length)) * 100, 2) }
    })

    const performanceComparison = pspSet.map((psp) => {
      const pspAttempts = attempts.filter((attempt) => attempt.psp === psp)
      const pspIntents = intents.filter((intent) => intent.psp === psp)
      const success = pspIntents.filter((intent) => intent.status === 'CONFIRMED').length

      return {
        psp,
        success_rate: round((success / Math.max(1, pspIntents.length)) * 100, 2),
        p95_latency_ms: round(pspAttempts.map((attempt) => attempt.latencyMs).sort((a, b) => a - b)[Math.floor(0.95 * Math.max(0, pspAttempts.length - 1))] || 0, 2),
        fee_bps: round(6 + psp.length * 0.8, 2),
        webhook_accuracy: webhookDeliveryRate.find((row) => row.name === psp)?.value || 0,
      }
    })

    const failureRateByCodePerPSP: Record<string, NamedValue[]> = {}
    pspSet.forEach((psp) => {
      const codeMap = new Map<string, number>()
      failures.filter((failure) => failure.psp === psp).forEach((failure) => {
        codeMap.set(failure.errorCode, (codeMap.get(failure.errorCode) || 0) + 1)
      })
      failureRateByCodePerPSP[psp] = topN(Array.from(codeMap.entries()).map(([name, value]) => ({ name, value })), 6)
    })

    const routingRecommendations = ['UPI', 'IMPS', 'NEFT', 'RTGS'].map((rail) => {
      const candidates = performanceComparison.slice().sort((a, b) => b.success_rate - a.success_rate)
      const best = candidates[0]
      return {
        rail,
        recommended_psp: best?.psp || 'Razorpay',
        reason: `Highest success (${best?.success_rate || 0}%) with stable latency`,
      }
    })

    const connectorHealth = performanceComparison.map((row) => {
      const errorPenalty = failures.filter((failure) => failure.psp === row.psp).length
      const latencyScore = Math.max(0, 100 - row.p95_latency_ms / 20)
      const score = computePSPHealthScore(row.success_rate, latencyScore, row.webhook_accuracy, errorPenalty)
      return { name: row.psp, value: score }
    })

    return {
      generated_at: new Date().toISOString(),
      psp_status_pills: pspStatusPills,
      error_rate_series: errorRateSeries,
      latency_heatmap: latencyHeatmap,
      webhook_delivery_rate: webhookDeliveryRate,
      rail_operational_status: ['UPI', 'IMPS', 'NEFT', 'RTGS'].map((rail) => ({
        name: rail,
        status: 'GREEN',
        status_text: 'Operational',
        last_seen: rail === 'NEFT' ? 'Next cycle 14:00 IST' : 'Live',
      })),
      performance_comparison: performanceComparison,
      failure_rate_by_code_per_psp: failureRateByCodePerPSP,
      routing_recommendations: routingRecommendations,
      outage_log: dataset.alerts
        .filter((alert) => alert.title.toLowerCase().includes('webhook') || alert.title.toLowerCase().includes('sla'))
        .map((alert) => ({
          alert_id: alert.alertId,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          relative_time: relativeTs(alert.timestamp),
          status: alert.status,
        })),
      psp_connector_health_score: connectorHealth,
      imps_reversal_risk_monitor: intents
        .filter((intent) => intent.rail === 'IMPS' && intent.status === 'PENDING')
        .slice(0, 10)
        .map((intent) => ({
          alert_id: `imps_${intent.intentId}`,
          severity: 'HIGH',
          title: `IMPS reversal risk near threshold`,
          description: `${intent.intentId} pending near 30m mark`,
          relative_time: relativeTs(intent.dispatchedAt || intent.createdAt),
          status: 'ACTIVE',
        })),
    }
  })
}

export function getErrorIntelligenceMetrics(tenantId: string, timeRangeRaw?: string) {
  const { from, label } = parseTimeRange(timeRangeRaw)
  const key = `errors:${tenantId}:${label}`

  return cached(key, 30_000, () => {
    const dataset = getDataset(tenantId)
    const failures = rangeFilter(dataset.failures, from, (failure) => new Date(failure.occurredAt))

    const treeMapByCategory = new Map<string, Map<string, number>>()
    failures.forEach((failure) => {
      const categoryMap = treeMapByCategory.get(failure.errorCategory) || new Map<string, number>()
      categoryMap.set(failure.errorCode, (categoryMap.get(failure.errorCode) || 0) + 1)
      treeMapByCategory.set(failure.errorCategory, categoryMap)
    })

    const errorCodeTreemap = Array.from(treeMapByCategory.entries()).map(([category, codeMap]) => ({
      name: category,
      value: Array.from(codeMap.values()).reduce((sum, count) => sum + count, 0),
      children: Array.from(codeMap.entries()).map(([code, count]) => ({
        name: code,
        value: count,
      })),
    }))

    const failureTrendByCode: Record<string, TrendPoint[]> = {}
    Array.from(new Set(failures.map((failure) => failure.errorCode))).forEach((code) => {
      const bucketMap = new Map<string, number>()
      rollingHourlyPoints(from, new Date()).forEach((bucket) => bucketMap.set(bucket, 0))
      failures.filter((failure) => failure.errorCode === code).forEach((failure) => {
        const bucket = toBucketHour(new Date(failure.occurredAt))
        bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1)
      })
      failureTrendByCode[code] = Array.from(bucketMap.entries()).map(([bucket, value]) => ({ bucket, value }))
    })

    const failureTimeHeatmap: HeatCell[] = []
    failures.forEach((failure) => {
      const index = heatIndex(new Date(failure.occurredAt))
      const existing = failureTimeHeatmap.find((cell) => cell.x === index.day && cell.y === index.hour)
      if (existing) existing.value += 1
      else failureTimeHeatmap.push({ x: index.day, y: index.hour, value: 1 })
    })

    const failureByPSPMatrix = Array.from(new Set(failures.map((failure) => failure.psp))).map((psp) => {
      const codeCount: Record<string, number> = {}
      failures.filter((failure) => failure.psp === psp).forEach((failure) => {
        codeCount[failure.errorCode] = (codeCount[failure.errorCode] || 0) + 1
      })
      return {
        psp,
        codes: codeCount,
      }
    })

    const failureByBankMap = new Map<string, number>()
    failures.forEach((failure) => {
      failureByBankMap.set(failure.bankIfsc, (failureByBankMap.get(failure.bankIfsc) || 0) + 1)
    })

    const dataQualityMap = failures
      .filter((failure) => failure.errorCategory === 'DATA_QUALITY')
      .reduce<Map<string, number>>((map, failure) => {
        map.set(failure.errorCode, (map.get(failure.errorCode) || 0) + 1)
        return map
      }, new Map<string, number>())

    const dataQualityIssueTracker = topN(
      Array.from(dataQualityMap.entries()).map(([root_cause, count]) => ({ name: root_cause, value: count })),
      10,
    ).map((entry) => ({ root_cause: entry.name, count: entry.value }))

    const resolutionByType = topN(
      Array.from(new Set(failures.map((failure) => failure.errorCategory))).map((category) => {
        const entries = failures.filter((failure) => failure.errorCategory === category)
        const avg = entries.reduce((sum, failure) => sum + (failure.resolutionSeconds || 0), 0) / Math.max(1, entries.length)
        return { name: category, value: round(avg / 60, 2) }
      }),
      8,
    )

    const now = new Date()
    const exceptionQueueDepth = rollingHourlyPoints(new Date(now.getTime() - 24 * 60 * 60 * 1000), now).map((bucket) => {
      const count = dataset.dlqItems.filter((item) => toBucketHour(new Date(item.createdAt)) <= bucket).length
      return { bucket, value: count }
    })

    const retrySuccessRateByCode = topN(
      Array.from(new Set(failures.map((failure) => failure.errorCode))).map((code) => {
        const entries = failures.filter((failure) => failure.errorCode === code)
        const retrySuccess = entries.filter((failure) => failure.retrySuccess).length
        return { name: code, value: round((retrySuccess / Math.max(1, entries.length)) * 100, 2) }
      }),
      10,
    )

    return {
      generated_at: new Date().toISOString(),
      error_code_treemap: errorCodeTreemap,
      failure_trend_by_code: failureTrendByCode,
      failure_time_heatmap: failureTimeHeatmap,
      failure_by_psp_matrix: failureByPSPMatrix,
      failure_by_bank_ranking: topN(Array.from(failureByBankMap.entries()).map(([name, value]) => ({ name, value })), 10),
      data_quality_issue_tracker: dataQualityIssueTracker,
      resolution_time_by_type: resolutionByType,
      exception_queue_depth: exceptionQueueDepth,
      retry_success_rate_by_code: retrySuccessRateByCode,
    }
  })
}

export function getIntentDetail(tenantId: string, intentId: string) {
  const key = `intent-detail:${tenantId}:${intentId}`

  return cached(key, 15_000, () => {
    const dataset = getDataset(tenantId)
    const intent = dataset.intents.find((row) => row.intentId === intentId)

    if (!intent) {
      return null
    }

    const dispatchChain = dataset.dispatchAttempts
      .filter((attempt) => attempt.intentId === intentId)
      .sort((a, b) => a.attemptNo - b.attemptNo)
      .map((attempt) => ({
        attempt: attempt.attemptNo,
        psp: attempt.psp,
        rail: attempt.rail,
        status: attempt.status,
        latency_ms: attempt.latencyMs,
        error_code: attempt.errorCode,
        occurred_at: attempt.occurredAt,
      }))

    const signalDetails = dataset.reconSignals
      .filter((signal) => signal.intentId === intentId)
      .map((signal) => ({
        source: signal.source,
        utr: maskSensitive(signal.utr),
        hash: maskSensitive(signal.signatureHash),
        confidence: signal.source === 'BANK_STATEMENT' ? 'HIGH' : signal.source === 'POLLING' ? 'MEDIUM' : 'LOW',
        signature: maskSensitive(signal.signatureHash),
      }))

    const recon = dataset.reconResults.find((result) => result.intentId === intentId)
    const evidence = dataset.evidencePacks.find((pack) => pack.intentId === intentId)

    const lifecycleTimeline = [
      { stage: 'Intent Created', status: 'SUCCESS', occurred_at: intent.createdAt, delta_from_ms: 0, source: 'INTENT_ENGINE' },
      { stage: 'Governance', status: 'SUCCESS', occurred_at: intent.createdAt, delta_from_ms: 220, source: 'GOVERNANCE' },
      { stage: 'Dispatch', status: intent.status === 'FAILED' ? 'FAILED' : 'SUCCESS', occurred_at: intent.dispatchedAt || intent.createdAt, delta_from_ms: 450, source: 'DISPATCHER' },
      { stage: 'Outcome', status: intent.status, occurred_at: intent.confirmedAt || intent.dispatchedAt || intent.createdAt, delta_from_ms: 1200, source: 'PSP' },
      { stage: 'Reconciliation', status: recon?.state || 'PROVISIONAL', occurred_at: recon?.confirmedAt || intent.confirmedAt || intent.createdAt, delta_from_ms: 2200, source: 'RECON_ENGINE' },
    ]

    return {
      intent_id: intent.intentId,
      tenant_id: intent.tenantId,
      masked_beneficiary_token: maskSensitive(intent.beneficiaryToken),
      amount: intent.amount,
      currency: intent.currency,
      current_state: intent.status,
      lifecycle_timeline: lifecycleTimeline,
      llm_explanation:
        intent.status === 'CONFIRMED'
          ? 'Payment was dispatched successfully, matched across webhook, polling, and bank statement signals, and closed as CONFIRMED.'
          : intent.status === 'FAILED'
            ? 'Dispatch attempts exhausted due recurring provider errors. Evidence chain remains available for operator action and audit defense.'
            : 'Payment is in provisional finality; awaiting full signal convergence before closure.',
      explanation_confidence_badge: recon?.fullThreeSignal ? 'FULL_3_SIGNAL' : recon?.signalCount === 2 ? 'PARTIAL_2_SIGNAL' : 'SINGLE_SIGNAL',
      canonical_intent_json: {
        intent_id: intent.intentId,
        envelope_id: intent.envelopeId,
        client_reference_id: intent.clientReferenceId,
        seller_id: intent.sellerId,
        amount: intent.amount,
        currency: intent.currency,
        psp: intent.psp,
        rail: intent.rail,
        bank_ifsc: maskSensitive(intent.bankIfsc),
        beneficiary_token: maskSensitive(intent.beneficiaryToken),
      },
      governance_decision_log: [
        { decision: 'ALLOW', reason_code: 'RULES_PASSED', at: intent.createdAt },
        { decision: 'SLA_MONITOR', reason_code: 'RAIL_SLA_APPLIED', at: intent.dispatchedAt || intent.createdAt },
      ],
      signal_detail_viewer: signalDetails,
      evidence_pack_status: evidence?.status || 'MISSING',
      dispatch_attempt_chain: dispatchChain,
      zord_internal_log: [
        `trace=${intent.intentId} stage=intent accepted`,
        `trace=${intent.intentId} stage=dispatch psp=${intent.psp}`,
        `trace=${intent.intentId} stage=recon score=${recon?.confidenceScore || 0}`,
      ],
      reconciliation_confidence: recon?.confidenceScore || 0,
      routing_efficiency_score: round(100 - Math.min(70, dispatchChain.reduce((sum, attempt) => sum + attempt.latency_ms, 0) / 900), 2),
      psp_health_score: round(100 - (dataset.failures.filter((failure) => failure.psp === intent.psp).length / Math.max(1, dataset.intents.filter((item) => item.psp === intent.psp).length)) * 100, 2),
    }
  })
}

export function searchDataset(tenantId: string, queryRaw: string, limit = 25): SearchResult[] {
  const query = (queryRaw || '').trim().toLowerCase()
  if (!query) return []

  const dataset = getDataset(tenantId)
  const rows: SearchResult[] = []

  dataset.intents.forEach((intent) => {
    if (rows.length >= limit) return

    const checks: Array<{ type: SearchResult['type']; value: string; label: string }> = [
      { type: 'INTENT', value: intent.intentId, label: intent.intentId },
      { type: 'ENVELOPE', value: intent.envelopeId, label: intent.envelopeId },
      { type: 'CLIENT_REFERENCE', value: intent.clientReferenceId, label: intent.clientReferenceId },
      { type: 'UTR', value: intent.utr, label: maskSensitive(intent.utr) },
      { type: 'SELLER', value: intent.sellerId, label: intent.sellerId },
    ]

    for (const check of checks) {
      if (check.value.toLowerCase().includes(query)) {
        rows.push({
          type: check.type,
          id: intent.intentId,
          display: `${check.label} • ${intent.status} • INR ${amountINR(intent.amount)}`,
          matched_on: check.type,
          updated_ago: relativeTs(intent.createdAt),
        })
        break
      }
    }
  })

  return rows.slice(0, limit)
}

export function getAlerts(tenantId: string): AlertItem[] {
  const dataset = getDataset(tenantId)
  return dataset.alerts.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function getExportQueue(tenantId: string) {
  return recentExportQueue(tenantId)
}
