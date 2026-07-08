export interface SolutionCapability {
  slug: string
  title: string
  shortDescription: string
  image: string
}

function cap(solutionSlug: string, slug: string, title: string, shortDescription: string): SolutionCapability {
  return {
    slug,
    title,
    shortDescription,
    image: `/final-landing/solutions/capabilities/${solutionSlug}-${slug}.png`,
  }
}

export const solutionCapabilities: Record<string, SolutionCapability[]> = {
  'open-finance': [
    cap('open-finance', 'bank-statements', 'Bank statements', 'Normalized statement feeds from connected institutions.'),
    cap('open-finance', 'settlement-data', 'Settlement data', 'Settlement files and payout batches in one schema.'),
    cap('open-finance', 'ledger-feeds', 'Ledger feeds', 'General ledger and accounting entries, unified.'),
    cap('open-finance', 'balance-transactions', 'Balances & transactions', 'Live balances and transaction history, governed access.'),
  ],
  'fraud-risk-prevention': [
    cap('fraud-risk-prevention', 'velocity-watch', 'Velocity watch', 'Real-time spikes across users and beneficiaries.'),
    cap('fraud-risk-prevention', 'anomaly-detection', 'Anomaly detection', 'Cross-signal patterns before fraud spreads.'),
    cap('fraud-risk-prevention', 'case-workspace', 'Case workspace', 'Review-ready context for risk teams.'),
    cap('fraud-risk-prevention', 'callback-integrity', 'Callback integrity', 'Provider callbacks tied to movement truth.'),
  ],
  'onboarding-identity-verification': [
    cap('onboarding-identity-verification', 'identity-capture', 'Identity capture', 'Structured KYC data collection in one flow.'),
    cap('onboarding-identity-verification', 'verification-checks', 'Verification checks', 'Instant validation against configured rules.'),
    cap('onboarding-identity-verification', 'approval-routing', 'Approval routing', 'Clean applicants through, exceptions to review.'),
    cap('onboarding-identity-verification', 'fraud-screening', 'Fraud screening', 'Onboarding checks aligned with risk signals.'),
  ],
  'kyc-aml-compliance': [
    cap('kyc-aml-compliance', 'sanctions-screening', 'Sanctions screening', 'Watchlist and sanctions checks in one layer.'),
    cap('kyc-aml-compliance', 'exception-review', 'Exception review', 'Compliance queues with full case context.'),
    cap('kyc-aml-compliance', 'audit-trail', 'Audit trail', 'Every decision timestamped and defensible.'),
    cap('kyc-aml-compliance', 'escalation-queues', 'Escalation queues', 'Role-based handoffs without losing context.'),
  ],
  'income-verification-underwriting': [
    cap('income-verification-underwriting', 'asset-verification', 'Asset verification', 'Borrower assets verified in seconds.'),
    cap('income-verification-underwriting', 'cashflow-signals', 'Cash-flow signals', 'Income and movement summarized for underwriters.'),
    cap('income-verification-underwriting', 'borrower-connect', 'Borrower connect', 'Banking and payout data linked to the applicant.'),
    cap('income-verification-underwriting', 'underwriting-proof', 'Underwriting proof', 'Decisions backed by linked evidence.'),
  ],
  'inbound-bank-payments': [
    cap('inbound-bank-payments', 'collection-routing', 'Collection routing', 'Strongest bank path for each collection.'),
    cap('inbound-bank-payments', 'confirmation-tracking', 'Confirmation tracking', 'Provider and bank state until finality.'),
    cap('inbound-bank-payments', 'retry-intelligence', 'Retry intelligence', 'Structured retries when collections fail.'),
    cap('inbound-bank-payments', 'finance-reconciliation', 'Finance reconciliation', 'Clean payment truth into finance workflows.'),
  ],
  'outbound-bank-payments': [
    cap('outbound-bank-payments', 'payout-workspace', 'Payout workspace', 'Intent, beneficiary, and control in one surface.'),
    cap('outbound-bank-payments', 'connector-posture', 'Connector posture', 'Healthiest providers and rails before dispatch.'),
    cap('outbound-bank-payments', 'finality-tracking', 'Finality tracking', 'Acknowledgement through bank confirmation.'),
    cap('outbound-bank-payments', 'evidence-pack', 'Evidence Pack', 'Exportable proof when finance asks what happened.'),
  ],
  'personal-financial-management': [
    cap('personal-financial-management', 'account-aggregation', 'Account aggregation', 'Transactions and balances in one model.'),
    cap('personal-financial-management', 'cashflow-insights', 'Cash-flow insights', 'Patterns turned into consumer-ready signals.'),
    cap('personal-financial-management', 'budget-signals', 'Budget signals', 'Stable inputs for budgeting experiences.'),
    cap('personal-financial-management', 'transparent-proof', 'Transparent proof', 'Source and freshness behind every insight.'),
  ],
  'business-financial-management': [
    cap('business-financial-management', 'cash-visibility', 'Cash visibility', 'Inbound and outbound movement in one view.'),
    cap('business-financial-management', 'exception-queues', 'Exception queues', 'Right exceptions to the right team.'),
    cap('business-financial-management', 'month-end-close', 'Month-end close', 'Fewer manual rebuilds at close.'),
    cap('business-financial-management', 'shared-finance-truth', 'Shared finance truth', 'Ops and finance aligned on final state.'),
  ],
  'earned-wage-access': [
    cap('earned-wage-access', 'wage-approval', 'Wage approval', 'Eligibility, limits, and funding readiness.'),
    cap('earned-wage-access', 'disbursal-routing', 'Disbursal routing', 'Wage payouts through the healthiest rail.'),
    cap('earned-wage-access', 'bank-confirmation', 'Bank confirmation', 'Delivery loop closed with proof.'),
    cap('earned-wage-access', 'employee-proof', 'Employee proof', 'Support-ready evidence per disbursal.'),
  ],
  'billing-recurring-payments': [
    cap('billing-recurring-payments', 'mandate-billing', 'Mandate billing', 'Recurring collections with structured context.'),
    cap('billing-recurring-payments', 'smart-retries', 'Smart retries', 'Timing and routing based on failure shape.'),
    cap('billing-recurring-payments', 'payment-truth', 'Payment truth', 'Final state visible in one workspace.'),
    cap('billing-recurring-payments', 'collections-proof', 'Collections proof', 'Recurring revenue tied to reconciliation.'),
  ],
}

export function getCapabilitiesForSolution(solutionSlug: string): SolutionCapability[] {
  return solutionCapabilities[solutionSlug] ?? []
}
