/**
 * Business-language glossary for final-landing payout + connector copy.
 * Align with console: paymentOperationsCopy, connectorsCopy, evidenceCopy.
 *
 * Use on customer-facing strings only — not routes, ids, or code identifiers.
 */
export const landingBusinessLanguage = {
  /** Preferred customer-facing terms */
  use: {
    paymentInstructions: 'payment instructions',
    bankConfirmation: 'bank / settlement confirmation',
    matchingConfidence: 'matching confidence',
    paymentGaps: 'payment gaps',
    valueAtRisk: 'Value at Risk',
    unconfirmedExposure: 'unconfirmed exposure',
    connectorPerformance: 'connector performance',
    preventableLeakage: 'preventable leakage',
    evidencePack: 'Evidence Pack',
    processedVolume: 'processed payment value',
    pspOutcomes: 'PSP outcomes',
    settlementJournal: 'settlement journal',
    workspace: 'workspace',
  },
  /** Avoid in payout/connector marketing copy */
  avoid: {
    routing: 'implies Zord dispatches payments (V1 observes only)',
    webhook: 'engineering term — prefer confirmation / acknowledgement signals',
    payload: 'engineering term — prefer payment instruction / record',
    ingest: 'engineering term — prefer capture / receive',
    dispatch: 'implies Zord sends payouts',
    orchestration: 'overclaims automation',
    normalizedModel: 'engineering term — prefer shared payout record',
    api: 'keep for developer paths only, not hero copy',
    latency: 'prefer slow responses / delays',
    failover: 'prefer fallback connector / overflow handling',
  },
} as const
