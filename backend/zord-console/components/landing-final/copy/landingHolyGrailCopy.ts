/**
 * Canonical payout + connector language from:
 * - PAYOUT_COMMAND_BLUE_COPY_INVENTORY_v2.md
 * - CONNECTORS_PAGE_COPY_SPEC.md
 *
 * Keep final-landing user-facing strings aligned with console copy
 * (`paymentCommandCopy.ts`, `connectorsCopy.ts`, `paymentOperationsCopy.ts`).
 */
export const PAYOUT_COMMAND_HOLY_GRAIL = {
  paymentCommandCenter: {
    title: 'Payment Command Center',
    subtitle:
      'Track payment instructions, bank confirmations, settlement gaps, and proof readiness in one place.',
  },
  paymentOperationsView: {
    title: 'Payment Operations View',
    subtitle:
      'Track payment instructions, bank confirmations, settlement gaps, proof readiness, and review actions in one place.',
  },
  connectorPerformance: {
    title: 'Connector Performance & Leakage',
    subtitle:
      'Performance, leakage exposure, and recommended actions across your connected PSPs, banks, and rails.',
    overviewEyebrow: 'Connector performance overview',
  },
  evidence: {
    pageTitle: 'Evidence & Dispute Resolution',
    artifact: 'Evidence Pack',
    proofReadiness: 'Proof Readiness',
    exportAction: 'Export payment proof report',
  },
  kpis: {
    intendedPaymentValue: 'Intended Payment Value',
    bankConfirmedValue: 'Bank-Confirmed Value',
    fullyMatchedValue: 'Fully Matched Value',
    valueNeedingReview: 'Value Needing Review',
    matchConfidence: 'Match Confidence',
    unconfirmedExposure: 'Unconfirmed exposure',
    preventableLeakage: 'Preventable leakage',
    totalVolumeProcessed: 'Total volume processed',
    valueAtRisk: 'Value at Risk',
  },
  journals: {
    intentJournal: 'Intent Journal',
    settlementJournal: 'Settlement Journal',
  },
  pages: {
    paymentGaps: 'Payment Gaps & Value at Risk',
    matchingConfidence: 'Match Review',
    borrowerVerification: 'Borrower Verification',
    postDisbursalMonitoring: 'Post-Disbursal Monitoring',
  },
  askZord: {
    title: 'Ask Zord About This Payment Data',
    subtitle:
      'Ask questions about payment gaps, missing references, proof readiness, and review items.',
    composerPlaceholder: 'Ask anything or search',
    workspaceSupporting:
      'Grounded on payment instructions, settlement outcomes, match confidence, and proof readiness for your signed-in workspace.',
    processedSupporting:
      'Grounded on processed payment value, confirmation timing, bank-side movement, and Evidence Pack readiness already visible in the workspace.',
  },
  productName: 'Payment Command Center',
} as const
