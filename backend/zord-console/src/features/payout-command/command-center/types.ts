/** Ops Morning View — PAGE 1 Command Center (product copy + shape). */

export type AlertStripStatus = 'GREEN' | 'AMBER' | 'RED'

export type AlertStripProps = {
  status: AlertStripStatus
  /** Single line: issue + impact (₹) + context */
  message: string
  timestamp: string
  affectedValue?: number
  /** Secondary control: scroll to section id (e.g. home action panel). */
  actionAnchorId?: string
  actionAnchorLabel?: string
  /** Operator can hide the strip for this page view (client state). */
  dismissible?: boolean
}

export type NodeStatus = 'HEALTHY' | 'DELAYED' | 'ATTENTION'

export type Node = {
  id: string
  label: string
  status: NodeStatus
  volume: number
  signalHealthScore: number
  ambiguityRate: number
  lastUpdated: string
}

export type EdgeStatus = 'NORMAL' | 'DELAYED'

export type Edge = {
  from: string
  to: string
  status: EdgeStatus
}

export type ConnectivityGraphProps = {
  nodes: Node[]
  edges: Edge[]
  fetchedAt: string
  staleThresholdMs?: number
}

export type OpsInsightAlertTone = 'critical' | 'warning' | 'caution' | 'ok'

export type OpsInsightAlert = {
  id: string
  title: string
  body: string
  createdAt: string
  tone?: OpsInsightAlertTone
}

/** Outcome + impact KPI cards (Disbursement Command Center). */
export type OutcomeInsightVariant = 'success' | 'recovery' | 'progress' | 'risk' | 'mandate' | 'leakage'

export type OutcomeInsightCard = {
  id: string
  variant: OutcomeInsightVariant
  title: string
  value: string
  /** e.g. "+8%" on its own line under the main value */
  valueDelta?: string
  subtext: string
  aiInsight: string
}

export type InsightChipItem = {
  text: string
  variant: 'success' | 'caution' | 'critical' | 'mandate'
}

export type ConnectorHealthItem = {
  name: string
  status: 'healthy' | 'delayed' | 'attention'
  /** e.g. "96% confirmed · 3% pending" */
  metric: string
}

export type ImprovementMetric = {
  id: string
  direction: 'down' | 'up' | 'inr'
  value: string
  label: string
  /** e.g. "vs last period" / "vs baseline" */
  comparison: string
}

export type AnomalyInsight = {
  id: string
  headline: string
  impactLine: string
  suggestedAction: string
}

export type CommandCenterPayload = {
  fetchedAt: string
  /** Optional notice: delayed data / mismatch (§11 failure modes). */
  dataNotice?: 'delayed' | 'mismatch'
  alert: AlertStripProps
  insightAlerts: OpsInsightAlert[]
  nodes: Node[]
  edges: Edge[]
  outcomeInsightCards: OutcomeInsightCard[]
  connectorHealth: {
    sectionInsight: string
    items: ConnectorHealthItem[]
  }
  improvementMetrics: ImprovementMetric[]
  insightChips: InsightChipItem[]
  anomalies: AnomalyInsight[]
}
