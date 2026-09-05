export type InsightDelta = { pct: number; dir: 'up' | 'down'; label: string }

export type ZordInsightCard =
  | {
      id: string
      label: string
      type: 'insight'
      paragraph?: string
      prefix?: string
      highlight?: string
      suffix?: string
      /** Rendered as a standalone red badge below the paragraph (e.g. "7.57%"). */
      gapRate?: string
      delta?: InsightDelta
    }
  | {
      id: string
      label: string
      type: 'metric'
      valueRupee: number
      /** When set, shown instead of fmtINR(valueRupee) (e.g. literal “₹” from parent). */
      valueDisplay?: string
      subtext: string
      count?: number
      countLabel?: string
      delta?: InsightDelta
    }
  | {
      id: string
      label: string
      type: 'trend'
      spark: { w: string; v: number }[]
      currentValueRupee: number
      delta?: InsightDelta
    }
  | {
      id: string
      label: string
      type: 'alert'
      count: number
      topPattern: string
      exposureRupee: number
      delta?: InsightDelta
    }
