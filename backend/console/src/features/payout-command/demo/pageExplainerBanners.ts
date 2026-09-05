/** Slim visual explainers for main sidebar destinations (navy + azure, no violet). */

export type PageExplainerId =
  | 'overview'
  | 'connections'
  | 'upload'
  | 'intent'
  | 'dispatch'
  | 'trace'
  | 'settlement'
  | 'proof'
  | 'policies'
  | 'control-review'
  | 'contract'
  | 'outcome'
  | 'gaps'
  | 'ask'

export type PageExplainerCopy = {
  id: PageExplainerId
  eyebrow: string
  title: string
  body: string
  imageSrc: string
  badge?: string
}

export const PAGE_EXPLAINERS: Record<PageExplainerId, PageExplainerCopy> = {
  overview: {
    id: 'overview',
    eyebrow: 'Lifecycle',
    title: 'See what needs attention across the payout loop',
    body: 'Connect → Create → Govern → Seal → Dispatch → Settle → Prove - with blocked, short, and proof-ready items in one queue.',
    imageSrc: '/images/page-explainers/page-overview.png',
    badge: 'Sandbox',
  },
  connections: {
    id: 'connections',
    eyebrow: 'Connect',
    title: 'Source systems, rails, and outcome feeds',
    body: 'Honest modes only - file-based, connected observe, prepare & sign, or dispatch when it truly works.',
    imageSrc: '/images/page-explainers/page-connections.png',
    badge: 'Non-custodial',
  },
  upload: {
    id: 'upload',
    eyebrow: 'Create',
    title: 'Turn obligations into validated payout instructions',
    body: 'Upload a file, form, or API payload. Validate source, authority, beneficiary, and policy before money can move.',
    imageSrc: '/images/page-explainers/page-upload.png',
    badge: 'Pre-dispatch',
  },
  intent: {
    id: 'intent',
    eyebrow: 'Payouts',
    title: 'Payment instructions before and after seal',
    body: 'Track readiness, blocked value, and Action Contract status per batch - seal only what is eligible.',
    imageSrc: '/images/page-explainers/page-intent.png',
    badge: 'Intent Journal',
  },
  dispatch: {
    id: 'dispatch',
    eyebrow: 'Execution',
    title: 'Send sealed instructions through approved rails',
    body: 'Dispatch attempts, idempotency, and provider acknowledgements - sandbox-labelled when money movement is simulated.',
    imageSrc: '/images/page-explainers/page-dispatch.png',
    badge: 'Sandbox',
  },
  trace: {
    id: 'trace',
    eyebrow: 'Execution',
    title: 'Follow one payout from dispatch to outcome',
    body: 'Timeline of request, rail signals, and settlement events tied to the Payment Action Contract.',
    imageSrc: '/images/page-explainers/page-trace.png',
    badge: 'Payment Trace',
  },
  settlement: {
    id: 'settlement',
    eyebrow: 'Settlement',
    title: 'Expected vs observed settlement records',
    body: 'What banks and payment partners reported - freshness, amounts, and match status per batch.',
    imageSrc: '/images/page-explainers/page-settlement.png',
    badge: 'Journal',
  },
  proof: {
    id: 'proof',
    eyebrow: 'Prove',
    title: 'Evidence packs you can verify and export',
    body: 'Coverage of contract, dispatch, and settlement signals - portable proof, not a single opaque score.',
    imageSrc: '/images/page-explainers/page-proof.png',
    badge: 'Evidence',
  },
  policies: {
    id: 'policies',
    eyebrow: 'Govern',
    title: 'Rules a payout must satisfy before release',
    body: 'Policy packs decide block, warn, or allow - deterministic controls stay authoritative.',
    imageSrc: '/images/page-explainers/page-policies.png',
    badge: 'Policy Studio',
  },
  'control-review': {
    id: 'control-review',
    eyebrow: 'Govern',
    title: 'Resolve blocked or warned payouts before money moves',
    body: 'Compare authorised terms vs what changed - beneficiary, amount, or authority - then allow or keep blocked.',
    imageSrc: '/images/page-explainers/page-control-review.png',
    badge: 'Control Review',
  },
  contract: {
    id: 'contract',
    eyebrow: 'Seal',
    title: 'The signed, policy-bound Payment Action Contract',
    body: 'Commercial boundary for the payout - the lifecycle reference every later signal is compared against.',
    imageSrc: '/images/page-explainers/page-contract.png',
    badge: 'First-class',
  },
  outcome: {
    id: 'outcome',
    eyebrow: 'Resolve',
    title: 'Exact, short, return, or unresolved',
    body: 'Match decisions with evidence - contract amount vs settlement amount, never a single “Verified” score.',
    imageSrc: '/images/page-explainers/page-outcome.png',
    badge: 'Outcome Review',
  },
  gaps: {
    id: 'gaps',
    eyebrow: 'Resolve',
    title: 'Value requiring review and potential exposure',
    body: 'Short settlements, returns, and unmatched signals - exposure to investigate, not leakage as a fraud claim.',
    imageSrc: '/images/page-explainers/page-settlement.png',
    badge: 'Payment Gaps',
  },
  ask: {
    id: 'ask',
    eyebrow: 'Investigate',
    title: 'Ask Zord with citations - never silent mutations',
    body: 'Explain exceptions, trace payments, and draft safe workflows. Deterministic controls stay in charge.',
    imageSrc: '/images/page-explainers/page-ask.png',
    badge: 'Ask · Act · Build',
  },
}
