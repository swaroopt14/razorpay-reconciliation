/** User-facing copy for Payment Operations View (workspace dock). */
export const PAYMENT_OPERATIONS = {
  pageTitle: 'Payment Operations View',
  pageSubtitle:
    'Track payment instructions, bank confirmations, settlement gaps, proof readiness, and review actions in one place.',
  routingNoticeTitle: 'Routing not active yet',
  routingNoticeBody:
    'Zord is analyzing payment proof and settlement clarity. PSP/bank routing intelligence becomes available once bank/PSP dispatch is connected.',
  sourcesTitle: 'Connected Sources',
  sourcesFooter: 'Zord needs both payment instructions and outcome signals to complete proof.',
  clarityTitle: 'Value at Risk',
  clarityIncomplete: 'Incomplete',
  clarityIncompleteHint: 'Upload missing intent or bank confirmation data to calculate value at risk.',
  intentMissingTitle: 'Intent data missing',
  intentMissingHint:
    'Zord received settlement data, but original payment instructions are missing. Upload the payment file/API data to calculate gaps.',
  reviewZeroHint: 'No payment value currently needs review.',
  healthBriefTitle: 'Payment Health Brief',
  healthBriefBody:
    'Zord checks whether payment instructions can be linked to bank, PSP, settlement, or statement records. Items with missing references, weak matches, or settlement gaps are moved to review.',
  itemsNeedingReviewTitle: 'Operational Review Queues',
  itemsNeedingReviewMeta:
    'Separate counts for ingest failures, match review, financial exceptions, and open recommendations — no combined fallback.',
  askPanelTitle: 'Ask Zord About This Payment Data',
  askPanelSubtitle:
    'Ask questions about payment gaps, missing references, proof readiness, and review items.',
  askPrompt: 'What should Zord check in this payment data?',
  composerPlaceholder: 'Ask anything or search',
  composerHint: 'Ask: "Which payments need review?" or "What data is missing?"',
  footerLabel: 'Ask Zord about payments, gaps, or proof',
  routingTabDisabled:
    'Model is still in training phase, please make sure to include words like intent and settlement before use.',
} as const

export const WORKSPACE_HERO_COPY = {
  intentOnly: {
    label: 'Payment Instructions Received',
    subtitle: 'Payment records Zord received in this period.',
  },
  settlementOnly: {
    label: 'Settlement Records Received',
    subtitle: 'Bank/settlement records Zord received in this period.',
  },
  full: {
    label: 'Payments in Scope',
    subtitle: 'Payment records available for matching and proof.',
  },
  empty: {
    label: 'Payments in Scope',
    subtitle: 'Upload intent or settlement data to begin.',
  },
  intentMissing: {
    label: 'Intent data missing',
    subtitle:
      'Zord received settlement data, but original payment instructions are missing. Upload the payment file/API data to calculate gaps.',
  },
} as const

export const workspacePromptCopyByTab = {
  Today: {
    question: PAYMENT_OPERATIONS.askPrompt,
    supporting:
      'Grounded on payment instructions, settlement outcomes, match confidence, and proof readiness for your signed-in workspace.',
    suggestions: [
      'Which payments need review?',
      'Why is proof incomplete for this period?',
      'Which records are missing bank references?',
      'What value is unmatched or short-settled?',
      'What should the accounts team upload next?',
    ],
  },
  'Value at Risk': {
    question: 'What payment value is unmatched, short-settled, or at risk?',
    supporting: 'Grounded on leakage KPIs: intended vs observed settlement and review exposure.',
    suggestions: [
      'What value is unmatched or short-settled?',
      'Show intended vs settled value for this period',
      'Is any settlement data missing matching intents?',
      'What should finance review first?',
    ],
  },
  Proof: {
    question: 'What evidence packs are ready for finance or audit?',
    supporting: 'Grounded on defensibility, evidence pack rate, and governance coverage.',
    suggestions: [
      'Which evidence packs can finance close now?',
      'What evidence is still missing today?',
      'What is blocking proof export?',
    ],
  },
  Sources: {
    question: 'Which data sources has Zord received for this workspace?',
    supporting: 'Grounded on ingest status for intent files, settlement files, bank statements, and evidence.',
    suggestions: [
      'What should the accounts team upload next?',
      'Which source files are missing?',
      'Is bank confirmation data connected?',
      'When was intent data last received?',
    ],
  },
  Actions: {
    question: 'What review actions or recommendations are open?',
    supporting: 'Grounded on recommendations KPIs and items needing operator review.',
    suggestions: [
      'Which payments need review?',
      'How many actions are still unresolved?',
      'What should ops do next?',
      'Summarize open review items',
    ],
  },
  Routing: {
    question: PAYMENT_OPERATIONS.askPrompt,
    supporting: PAYMENT_OPERATIONS.routingNoticeBody,
    suggestions: [],
  },
} as const

export const SUMMARY_TILE_LABELS = {
  inScope: 'Payments in Scope',
  paymentInstructionValue: 'Payment Instruction Value',
  settlementValueObserved: 'Settlement Value Observed',
  unmatchedIntentValue: 'Unmatched Intent Value',
  matchConfidence: 'Average Match Confidence',
  proofReadiness: 'Proof Readiness',
} as const
