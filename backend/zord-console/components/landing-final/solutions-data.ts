/** Solutions catalog - everyday fintech use cases from landing page .md. */

export type SolutionViewId = 'use-case' | 'workflow'

export type SolutionGlyphName =
  | 'open-finance'
  | 'fraud-risk'
  | 'identity'
  | 'compliance'
  | 'income'
  | 'inbound'
  | 'outbound'
  | 'personal-finance'
  | 'business-finance'
  | 'wages'
  | 'billing'

export interface SolutionItem {
  slug: string
  title: string
  description: string
  shortDescription: string
  icon: SolutionGlyphName
  views: SolutionViewId[]
  eyebrow: string
  heroTitle: string
  heroBody: string
  audience: string
  outcomes: { label: string; value: string }[]
  pillars: { title: string; description: string }[]
  workflow: { step: string; title: string; body: string }[]
  relatedProducts: string[]
}

export const solutionEntries: SolutionItem[] = [
  {
    slug: 'large-payout-batches',
    title: 'Large payout batches',
    description: 'Follow big payment files from upload to proof',
    shortDescription:
      'Track large payment files from upload through bank confirmation and a proof pack you can share.',
    icon: 'outbound',
    views: ['use-case', 'workflow'],
    eyebrow: 'Batch operations',
    heroTitle: 'Keep large payout batches easy to follow from file to proof',
    heroBody:
      'When your business sends large payment files, Zord helps ops and finance follow each batch - what was meant to pay, what was confirmed, and what still needs a person.',
    audience: 'Best for teams running large payment files across finance and operations.',
    outcomes: [
      { label: 'Batch tracking', value: 'End to end' },
      { label: 'Meant to pay vs confirmed', value: 'One view' },
      { label: 'Proof pack', value: 'Ready to export' },
    ],
    pillars: [
      {
        title: 'One batch record',
        description: 'Organize payment instructions as a batch so every team follows the same progress story.',
      },
      {
        title: 'Clear confirmation status',
        description: 'See which amounts the bank confirmed and which still need attention.',
      },
      {
        title: 'Ready for proof',
        description: 'Move from matching and review into a proof pack without rebuilding the story.',
      },
    ],
    workflow: [
      { step: '01', title: 'Upload instructions', body: 'Bring in the payment file your business meant to pay.' },
      { step: '02', title: 'Track the batch', body: 'Follow progress and confirmations in one place.' },
      { step: '03', title: 'Export proof', body: 'Build a proof pack when finance or audit needs the trail.' },
    ],
    relatedProducts: ['Payout workspace', 'Payment instructions', 'Proof pack'],
  },
  {
    slug: 'nbfc-payouts',
    title: 'NBFC payouts',
    description: 'Keep non-banking payouts easy to explain',
    shortDescription:
      'Give NBFC teams a clear view of payment instructions, confirmations, exceptions, and proof.',
    icon: 'business-finance',
    views: ['use-case'],
    eyebrow: 'NBFC operations',
    heroTitle: 'Make NBFC payouts easy to explain across ops and finance',
    heroBody:
      'Zord connects what you meant to pay with bank confirmations and review items so NBFC teams can answer what happened without scattered files.',
    audience: 'Best for NBFC ops, finance, and risk teams.',
    outcomes: [
      { label: 'Shared record', value: 'Ops + finance' },
      { label: 'Exception path', value: 'Needs a person' },
      { label: 'Audit trail', value: 'Proof pack' },
    ],
    pillars: [
      {
        title: 'Meant to pay vs confirmed',
        description: 'Compare what you meant to pay with what banks and partners confirmed.',
      },
      {
        title: 'Exception clarity',
        description: 'Send unclear matches and gaps to a review list for a person to decide.',
      },
      {
        title: 'Proof for oversight',
        description: 'Keep a proof pack ready when compliance or audit asks for the full story.',
      },
    ],
    workflow: [
      { step: '01', title: 'Capture instructions', body: 'Record expected payouts with batch context.' },
      { step: '02', title: 'Confirm outcomes', body: 'Match settlement files and bank confirmations.' },
      { step: '03', title: 'Prove conclusions', body: 'Export a proof pack for review and audit.' },
    ],
    relatedProducts: ['Payment gaps', 'Review list', 'Proof pack'],
  },
  {
    slug: 'marketplace-settlements',
    title: 'Marketplace settlements',
    description: 'Connect marketplace payouts to confirmations',
    shortDescription:
      'Link marketplace payout amounts with settlement records and find short or missing confirmations.',
    icon: 'personal-finance',
    views: ['use-case'],
    eyebrow: 'Marketplace ops',
    heroTitle: 'Connect marketplace payouts with what actually settled',
    heroBody:
      'When sellers and partners expect settlement, Zord helps you see what was owed, what was confirmed, and what is still unclear - in one shared view.',
    audience: 'Best for marketplaces and platform payout teams.',
    outcomes: [
      { label: 'Settlement gaps', value: 'Easy to see' },
      { label: 'Paid less than expected', value: 'Flagged' },
      { label: 'Review path', value: 'Shared' },
    ],
    pillars: [
      {
        title: 'What was owed',
        description: 'Keep what you meant to pay visible next to what settlement files show.',
      },
      {
        title: 'Gap detection',
        description: 'Spot unmatched, short, or unclear amounts before they become merchant disputes.',
      },
      {
        title: 'Shared investigation',
        description: 'Ops and finance work from the same payout record.',
      },
    ],
    workflow: [
      { step: '01', title: 'Load payout obligations', body: 'Bring marketplace payment instructions into a batch.' },
      { step: '02', title: 'Match settlements', body: 'Compare settlement files with expected payouts.' },
      { step: '03', title: 'Resolve gaps', body: 'Clear mismatches and keep proof ready for disputes.' },
    ],
    relatedProducts: ['Bank confirmations', 'Payment gaps', 'Proof pack'],
  },
  {
    slug: 'payroll',
    title: 'Payroll',
    description: 'Check payroll payouts with proof',
    shortDescription:
      'Check that intended payroll amounts show up in bank confirmations, with a proof trail you can share.',
    icon: 'wages',
    views: ['use-case', 'workflow'],
    eyebrow: 'Payroll operations',
    heroTitle: 'Confirm payroll payouts without rebuilding the paper trail',
    heroBody:
      'Zord helps finance and ops check that intended payroll amounts show up in confirmations - and keep a proof pack ready when questions arrive.',
    audience: 'Best for payroll ops and finance close teams.',
    outcomes: [
      { label: 'Intended payroll', value: 'Tracked' },
      { label: 'Bank confirmation', value: 'Matched' },
      { label: 'Proof', value: 'Ready to export' },
    ],
    pillars: [
      {
        title: 'Instruction clarity',
        description: 'Keep the original payroll payment file visible for the whole batch.',
      },
      {
        title: 'Confirmation matching',
        description: 'Connect bank and settlement confirmations back to those intended payments.',
      },
      {
        title: 'Close-ready proof',
        description: 'Export a proof pack instead of screenshots for payroll questions.',
      },
    ],
    workflow: [
      { step: '01', title: 'Upload payroll file', body: 'Bring payroll payment instructions into Zord.' },
      { step: '02', title: 'Match confirmations', body: 'Link bank outcomes to intended payments.' },
      { step: '03', title: 'Prove close', body: 'Share a proof pack with finance and audit.' },
    ],
    relatedProducts: ['Batch tracking', 'Bank confirmations', 'Proof pack'],
  },
  {
    slug: 'vendor-payouts',
    title: 'Vendor payouts',
    description: 'Track supplier payments end to end',
    shortDescription:
      'Follow supplier payment batches, find missing confirmations, and prepare proof finance can use.',
    icon: 'billing',
    views: ['use-case'],
    eyebrow: 'Vendor payments',
    heroTitle: 'Keep supplier payouts easy to explain from instruction to confirmation',
    heroBody:
      'Zord gives AP and ops one place to track vendor batches, find missing confirmations, and prepare proof for finance questions.',
    audience: 'Best for accounts payable and vendor ops teams.',
    outcomes: [
      { label: 'Batch status', value: 'Shared' },
      { label: 'Missing confirmations', value: 'Easy to see' },
      { label: 'Finance answers', value: 'Proof pack' },
    ],
    pillars: [
      {
        title: 'Batch tracking',
        description: 'Follow supplier payment files as one batch.',
      },
      {
        title: 'Confirmation watch',
        description: 'See which vendor payments are confirmed and which still need a person.',
      },
      {
        title: 'Dispute readiness',
        description: 'Keep proof attached when suppliers or auditors ask what happened.',
      },
    ],
    workflow: [
      { step: '01', title: 'Intake vendor file', body: 'Upload supplier payment instructions.' },
      { step: '02', title: 'Watch confirmations', body: 'Match bank and settlement outcomes.' },
      { step: '03', title: 'Answer finance', body: 'Export a proof pack for AP and audit.' },
    ],
    relatedProducts: ['Payout workspace', 'Payment gaps', 'Proof pack'],
  },
  {
    slug: 'enterprise-reconciliation',
    title: 'Enterprise reconciliation',
    description: 'Replace spreadsheet hunts with one payout record',
    shortDescription:
      'Bring together intended payments, settlements, matching decisions, and gaps - instead of chasing exports across tools.',
    icon: 'inbound',
    views: ['use-case', 'workflow'],
    eyebrow: 'Reconciliation',
    heroTitle: 'Reconcile payouts from one shared record',
    heroBody:
      'Zord replaces fragmented searches with a single view of what was supposed to happen, what was confirmed, and what still needs a decision.',
    audience: 'Best for finance reconciliation and payout ops teams.',
    outcomes: [
      { label: 'Shared truth', value: 'One record' },
      { label: 'Gaps', value: 'Prioritized' },
      { label: 'Decisions', value: 'Easy to follow' },
    ],
    pillars: [
      {
        title: 'One payout story',
        description: 'Connect instruction, settlement, match, and review in one trail.',
      },
      {
        title: 'Gap priorities',
        description: 'Focus teams on unmatched and unclear amounts that still need work.',
      },
      {
        title: 'Clear conclusions',
        description: 'Keep the why behind each match and difference easy to review.',
      },
    ],
    workflow: [
      { step: '01', title: 'Bring both sides in', body: 'Load payment instructions and settlement files.' },
      { step: '02', title: 'Match and review', body: 'Have a person decide on unclear matches.' },
      { step: '03', title: 'Close with proof', body: 'Export a proof pack for finance close.' },
    ],
    relatedProducts: ['Payment instructions', 'Bank confirmations', 'Review list'],
  },
  {
    slug: 'audit-preparation',
    title: 'Audit preparation',
    description: 'Proof packs ready for audit questions',
    shortDescription:
      'Assemble source context, decisions, and summaries so audit can follow a payment end to end.',
    icon: 'compliance',
    views: ['use-case'],
    eyebrow: 'Audit readiness',
    heroTitle: 'Make payout proof ready before the audit asks',
    heroBody:
      'Zord helps teams build a proof pack that connects original instructions, confirmations, matching decisions, and checks.',
    audience: 'Best for finance, compliance, and audit-facing teams.',
    outcomes: [
      { label: 'Proof pack', value: 'Ready to export' },
      { label: 'Full payment trail', value: 'Easy to follow' },
      { label: 'Review time', value: 'Shorter' },
    ],
    pillars: [
      {
        title: 'Proof along the way',
        description: 'Proof builds as work happens - not as a last-minute scramble.',
      },
      {
        title: 'Clear trail',
        description: 'Follow a payment from instruction through settlement and review.',
      },
      {
        title: 'Shared package',
        description: 'Give auditors one package instead of chats, exports, and screenshots.',
      },
    ],
    workflow: [
      { step: '01', title: 'Complete matching', body: 'Finish confirmation and review for the batch.' },
      { step: '02', title: 'Build proof pack', body: 'Assemble the trail finance and audit need.' },
      { step: '03', title: 'Export', body: 'Share proof for ops review or audit prep.' },
    ],
    relatedProducts: ['Proof pack', 'Today view', 'Ask Zord'],
  },
  {
    slug: 'operational-monitoring',
    title: 'Operational monitoring',
    description: 'Watch payout health and delays early',
    shortDescription:
      'Watch confirmation delays and odd patterns that make payouts hard to explain - before they become incidents.',
    icon: 'fraud-risk',
    views: ['use-case'],
    eyebrow: 'Monitoring',
    heroTitle: 'Spot payout health issues before they become finance problems',
    heroBody:
      'Zord helps teams watch batch status, confirmation delays, and review load so leadership and ops act with the same context.',
    audience: 'Best for ops leaders and payout support teams.',
    outcomes: [
      { label: 'Current status', value: 'Clear' },
      { label: 'Delays', value: 'Easy to see' },
      { label: 'Review load', value: 'Clear' },
    ],
    pillars: [
      {
        title: 'Simple status view',
        description: 'See money meant to pay, bank-confirmed amounts, and open gaps together.',
      },
      {
        title: 'Early warning',
        description: 'Notice delays and unclear matches while there is still time to act.',
      },
      {
        title: 'Shared context',
        description: 'Keep ops, finance, and leadership on the same payout story.',
      },
    ],
    workflow: [
      { step: '01', title: 'Start from Today', body: 'Read meant-to-pay vs confirmed and open review items.' },
      { step: '02', title: 'Drill into gaps', body: 'Open payment gaps and the review list for detail.' },
      { step: '03', title: 'Ask questions', body: 'Ask Zord plain-language questions about your payouts.' },
    ],
    relatedProducts: ['Today view', 'Payment gaps', 'Ask Zord'],
  },
]
