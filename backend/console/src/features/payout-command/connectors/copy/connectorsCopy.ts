/** Customer-facing copy for Connector Performance & Leakage. */

export const connectorsCopy = {
  pageTitle: 'Connector Performance & Leakage',
  pageSubtitle:
    'Performance, leakage exposure, and recommended actions across your connected PSPs, banks, and rails.',
  overview: {
    eyebrow: 'Connector performance overview',
    subcopy: (windowLabel: string, unconfirmedExposure: string) =>
      `${windowLabel} · Unconfirmed exposure ${unconfirmedExposure}`,
  },
  kpi: {
    totalVolumeProcessed: 'Total volume processed',
    totalVolumeProcessedSub: 'Across connected PSPs, banks, and rails',
    successRate: 'Success rate',
    successRateSub: 'Weighted by payment volume',
    successRatePatternsSub: 'Attachment decisions settled at intended amount',
    unconfirmedExposure: 'Unconfirmed exposure',
    unconfirmedExposureSub: 'Value not yet matched to a settlement',
    preventableLeakage: 'Preventable leakage',
    preventableLeakageSub: (pct: string) => `${pct}% of processed volume`,
    activeConnectors: 'Active connectors',
    activeConnectorsSub: 'PSP, bank, and rail endpoints',
    connectorsNeedingAttention: 'Connectors needing attention',
    allConnectorsHealthy: 'All connectors healthy',
    needReview: 'Need review',
  },
  charts: {
    leakageExposure: 'Leakage exposure trend',
    leakageExposureCurrent: 'Current leakage',
    leakageExposurePredicted: 'Predicted leakage',
    leakageExposureEmpty:
      'No leakage exposure points in this window yet. Run intelligence snapshots or widen the time range.',
    leakageComposition: 'Leakage Composition',
    leakageEmpty:
      'No leakage breakdown in this window yet. Leakage KPIs or connector exposure will populate this chart.',
  },
  grid: {
    title: 'Connector Grid',
    noActionNeeded: 'No action needed',
  },
  states: {
    loadErrorTitle: 'Could not load connector performance data',
    loadErrorBody: 'The intelligence APIs did not respond. Check your connection and try again.',
    emptyTitle: 'No connector performance data yet',
    emptyBody:
      'Ingest payment events and run intelligence snapshots to see connector health, leakage composition, and recommended actions here.',
  },
  sections: {
    detectedPatterns: 'Performance Signals',
    recommendedActions: 'Recommended Actions',
    recommendedRoutes: 'Recommended Routes',
    preventableLeakageImpact: 'Preventable Exposure by Action',
  },
} as const
