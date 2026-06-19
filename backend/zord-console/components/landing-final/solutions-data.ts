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

export const solutionMenuViews = [
  {
    id: 'use-case',
    label: 'By use case',
    description: 'Explore ZORD by the operator problem you need to solve first.',
  },
  {
    id: 'workflow',
    label: 'By workflow',
    description: 'Browse the payment, onboarding, and data flows teams modernize next.',
  },
] as const

export const solutionEntries: SolutionItem[] = [
  {
    slug: 'open-finance',
    title: 'Open finance',
    description: 'Connect to financial data through a single API',
    shortDescription: 'Unify bank, statement, payout, and ledger data into one normalized access layer.',
    icon: 'open-finance',
    views: ['use-case'],
    eyebrow: 'Data infrastructure',
    heroTitle: 'Connect to financial data through one API and one normalized model',
    heroBody:
      'ZORD lets teams move from fragmented bank and payout feeds to a governed data layer that product, operations, and underwriting teams can rely on.',
    audience: 'Best for product teams, lenders, finance platforms, and modern treasury stacks.',
    outcomes: [
      { label: 'Connected institutions', value: 'Configurable' },
      { label: 'Normalized payloads', value: 'One schema' },
      { label: 'Access model', value: 'Governed' },
    ],
    pillars: [
      {
        title: 'One access layer',
        description: 'Connect transaction, balance, statement, and payout data without rebuilding mappings per source.',
      },
      {
        title: 'Permissioned distribution',
        description: 'Give product, risk, and finance teams the right slice of financial data without duplicating systems.',
      },
      {
        title: 'Operational context',
        description: 'Keep source health, freshness, and proof attached to the data so downstream teams trust what they see.',
      },
    ],
    workflow: [
      { step: '01', title: 'Connect sources', body: 'Bring bank, payout, ledger, and statement feeds into one governed connection layer.' },
      { step: '02', title: 'Normalize records', body: 'Translate source-specific payloads into a shared operational and financial schema.' },
      { step: '03', title: 'Distribute safely', body: 'Route the right data to products, workflows, and internal teams with permissions built in.' },
    ],
    relatedProducts: ['Data contracts', 'Reconciliation', 'Evidence Pack exports'],
  },
  {
    slug: 'fraud-risk-prevention',
    title: 'Fraud & risk prevention',
    description: 'Detect & prevent fraud across your user base',
    shortDescription: 'Catch anomalies across identity, account behavior, payout velocity, and callback integrity.',
    icon: 'fraud-risk',
    views: ['use-case'],
    eyebrow: 'Risk systems',
    heroTitle: 'Detect and prevent fraud before it spreads through live user and payout flows',
    heroBody:
      'Use ZORD to combine behavior, beneficiary, and provider-side signals into one risk layer that flags suspicious movement before operations and finance inherit the damage.',
    audience: 'Best for marketplaces, wallets, lenders, gaming, and high-volume fintech operations.',
    outcomes: [
      { label: 'Signal sources', value: '6 layers' },
      { label: 'Velocity watch', value: 'Real time' },
      { label: 'Case readiness', value: 'Workspace' },
    ],
    pillars: [
      {
        title: 'Cross-user anomaly detection',
        description: 'Spot unusual account linking, velocity spikes, and beneficiary reuse across your user base.',
      },
      {
        title: 'Provider and callback trust',
        description: 'Layer provider acknowledgements and callback integrity into the same fraud review flow.',
      },
      {
        title: 'Review-ready context',
        description: 'Hand risk teams a defensible case with movement history, signal changes, and proof attached.',
      },
    ],
    workflow: [
      { step: '01', title: 'Watch live movement', body: 'Track suspicious payout or payment patterns as traffic moves through providers and banks.' },
      { step: '02', title: 'Score behavior', body: 'Blend user, beneficiary, callback, and rail-level anomalies into one risk picture.' },
      { step: '03', title: 'Trigger action', body: 'Hold, review, or escalate with context that support, ops, and risk teams can all understand.' },
    ],
    relatedProducts: ['Risk scoring', 'Identity checks', 'Bank exposure'],
  },
  {
    slug: 'onboarding-identity-verification',
    title: 'Onboarding & identity verification',
    description: 'Instantly onboard new users & verify identities',
    shortDescription: 'Compress onboarding time while keeping KYC, approval, and fraud checks aligned.',
    icon: 'identity',
    views: ['use-case', 'workflow'],
    eyebrow: 'Identity workflows',
    heroTitle: 'Instantly onboard new users and verify identities without adding review chaos',
    heroBody:
      'ZORD gives growth, onboarding, and risk teams one operating layer for identity collection, verification status, and approval decisions so new users move faster with fewer blind spots.',
    audience: 'Best for fintech apps, marketplaces, lending stacks, and regulated onboarding flows.',
    outcomes: [
      { label: 'Approval path', value: '1 workflow' },
      { label: 'Manual review drop', value: 'Reduced' },
      { label: 'Onboarding time', value: 'Structured' },
    ],
    pillars: [
      {
        title: 'Faster user activation',
        description: 'Collapse fragmented onboarding steps into one structured verification flow.',
      },
      {
        title: 'Shared review context',
        description: 'Keep product, risk, and operations aligned on the same identity status and exception reason.',
      },
      {
        title: 'Proof on every decision',
        description: 'Preserve the checks, timestamps, and approval trail required for later investigation or audit.',
      },
    ],
    workflow: [
      { step: '01', title: 'Capture identity data', body: 'Collect the user, business, and banking details required for onboarding.' },
      { step: '02', title: 'Run verification', body: 'Validate identity, ownership, and account linkages against your configured rules.' },
      { step: '03', title: 'Approve or review', body: 'Push clean applicants through instantly and route exceptions into guided review queues.' },
    ],
    relatedProducts: ['Identity checks', 'KYC review', 'Fraud monitoring'],
  },
  {
    slug: 'kyc-aml-compliance',
    title: 'KYC & AML compliance',
    description: 'Manage compliance & mitigate risk',
    shortDescription: 'Give compliance teams one place to review identity, watchlists, and suspicious movement.',
    icon: 'compliance',
    views: ['use-case', 'workflow'],
    eyebrow: 'Compliance controls',
    heroTitle: 'Manage KYC and AML compliance with one review surface instead of disconnected checks',
    heroBody:
      'ZORD turns compliance from a stitched process into an operating layer where KYC status, exceptions, sanctions context, and payout behavior sit together.',
    audience: 'Best for regulated fintechs, lenders, B2B payments, and treasury platforms.',
    outcomes: [
      { label: 'Review context', value: 'Unified' },
      { label: 'Exception queues', value: 'Role-based' },
      { label: 'Audit trail', value: 'Always on' },
    ],
    pillars: [
      {
        title: 'One compliance workspace',
        description: 'Review identity, ownership, watchlist outcomes, and suspicious movement in one place.',
      },
      {
        title: 'Clear escalation logic',
        description: 'Move cases between automation, assisted review, and full compliance escalation without rebuilding context.',
      },
      {
        title: 'Defensible records',
        description: 'Preserve each decision, control, and timestamp for internal audit and regulator review.',
      },
    ],
    workflow: [
      { step: '01', title: 'Collect compliance data', body: 'Capture the data and documents required for KYC and AML review.' },
      { step: '02', title: 'Evaluate against rules', body: 'Run identity, ownership, and movement checks against configured controls.' },
      { step: '03', title: 'Escalate or clear', body: 'Route the case into the right queue and preserve every decision for proof.' },
    ],
    relatedProducts: ['Identity workflows', 'Risk case management', 'Evidence Pack exports'],
  },
  {
    slug: 'income-verification-underwriting',
    title: 'Income verification & underwriting',
    description: 'Verify borrower assets in seconds',
    shortDescription: 'Move underwriting from document chasing to usable financial signals and proof.',
    icon: 'income',
    views: ['use-case'],
    eyebrow: 'Underwriting',
    heroTitle: 'Verify borrower assets and income in seconds with finance-grade context attached',
    heroBody:
      'Use ZORD to bring banking data, payout history, and cash-flow signals into one underwriting layer that gives lenders faster answers and cleaner proof.',
    audience: 'Best for lenders, credit programs, underwriting teams, and embedded finance stacks.',
    outcomes: [
      { label: 'Asset verification', value: 'Faster' },
      { label: 'Review handoffs', value: 'Fewer' },
      { label: 'Proof sources', value: 'Linked' },
    ],
    pillars: [
      {
        title: 'Faster borrower verification',
        description: 'Check income and asset posture quickly using connected financial and payout data.',
      },
      {
        title: 'Cleaner underwriting decisions',
        description: 'Give risk teams a structured signal set instead of raw statements and screenshots.',
      },
      {
        title: 'Reusable evidence',
        description: 'Keep the data, logic, and proof tied together when a decision needs re-review later.',
      },
    ],
    workflow: [
      { step: '01', title: 'Connect borrower data', body: 'Bring in banking, payout, or statement data relevant to underwriting.' },
      { step: '02', title: 'Derive financial posture', body: 'Summarize income, assets, balances, and historical movement into underwriter-ready signals.' },
      { step: '03', title: 'Approve with proof', body: 'Pass decisions forward with the evidence that made them defensible.' },
    ],
    relatedProducts: ['Open finance', 'Credit programs', 'Proof layer'],
  },
  {
    slug: 'inbound-bank-payments',
    title: 'Inbound bank payments',
    description: 'Accept more successful bank payments',
    shortDescription: 'Improve payment success, connector performance, and reconciliation across bank-led inflows.',
    icon: 'inbound',
    views: ['workflow'],
    eyebrow: 'Inbound money movement',
    heroTitle: 'Accept more successful bank payments with cleaner confirmation and matching handling',
    heroBody:
      'ZORD helps teams improve inbound bank payment performance by reducing failures, improving confirmation clarity, and keeping finance aligned on the final truth.',
    audience: 'Best for recurring billing, collections, consumer finance, and bank-led payment flows.',
    outcomes: [
      { label: 'Success posture', value: 'Observable' },
      { label: 'Confirmation clarity', value: 'Workspace' },
      { label: 'Rail coverage', value: 'Multi-rail' },
    ],
    pillars: [
      {
        title: 'Higher payment success',
        description: 'Choose the strongest path for bank-linked collections and reduce avoidable failures.',
      },
      {
        title: 'Cleaner finance truth',
        description: 'Keep confirmations, retries, and final state aligned for collections and reconciliation teams.',
      },
      {
        title: 'Operational visibility',
        description: 'See which part of the flow broke before support tickets and finance noise begin stacking.',
      },
    ],
    workflow: [
      { step: '01', title: 'Initiate collection', body: 'Start the bank payment from a routed, monitored collection flow.' },
      { step: '02', title: 'Track confirmation', body: 'Watch provider, bank, and callback signals until the state is reliable.' },
      { step: '03', title: 'Close and reconcile', body: 'Pass clean payment truth into finance and follow-up workflows.' },
    ],
    relatedProducts: ['Connector performance', 'Confirmation tracking', 'Reconciliation'],
  },
  {
    slug: 'outbound-bank-payments',
    title: 'Outbound bank payments',
    description: 'Send faster, more reliable bank payouts',
    shortDescription: 'Run payouts with stronger connector visibility, finality tracking, and finance-ready proof.',
    icon: 'outbound',
    views: ['workflow'],
    eyebrow: 'Outbound money movement',
    heroTitle: 'Send faster, more reliable bank payouts with one operating truth underneath',
    heroBody:
      'This is the core ZORD workflow: move payouts through providers and banks with connector visibility, reliable confirmation, and Evidence Packs that close finance questions faster.',
    audience: 'Best for marketplaces, NBFCs, fintechs, PSPs, payroll, and treasury-heavy businesses.',
    outcomes: [
      { label: 'Connector surfaces', value: 'Workspace' },
      { label: 'Bank visibility', value: 'Linked' },
      { label: 'Evidence Pack', value: 'Exportable' },
    ],
    pillars: [
      {
        title: 'Connector posture visibility',
        description: 'See healthier providers and rails before failures become queue pressure.',
      },
      {
        title: 'Live finality tracking',
        description: 'Track acknowledgement, bank movement, and final confirmation in one place.',
      },
      {
        title: 'Faster proof for finance',
        description: 'Export a clear answer when operations, merchants, or auditors ask what happened.',
      },
    ],
    workflow: [
      { step: '01', title: 'Create payout intent', body: 'Capture the payout request with business, beneficiary, and control context.' },
      { step: '02', title: 'Observe connector posture', body: 'Track the payment path using current connector and rail signals in the workspace.' },
      { step: '03', title: 'Confirm and prove', body: 'Track the state to finality and package proof without reopening multiple systems.' },
    ],
    relatedProducts: ['Switchboard', 'Payout workspace', 'Evidence Packs'],
  },
  {
    slug: 'personal-financial-management',
    title: 'Personal financial management',
    description: 'Deliver tailored insights to improve finances',
    shortDescription: 'Use financial data and movement history to power better consumer financial experiences.',
    icon: 'personal-finance',
    views: ['use-case'],
    eyebrow: 'Consumer finance',
    heroTitle: 'Deliver tailored financial insights using connected account and payment context',
    heroBody:
      'ZORD helps teams turn fragmented transaction, payout, and balance data into usable insight layers for budgeting, cash-flow visibility, and personal finance experiences.',
    audience: 'Best for consumer finance apps, neobanks, budgeting tools, and fintech products.',
    outcomes: [
      { label: 'Data freshness', value: 'Near real time' },
      { label: 'Insight layers', value: 'Unified' },
      { label: 'Consumer trust', value: 'Transparent' },
    ],
    pillars: [
      {
        title: 'Connected financial visibility',
        description: 'Bring together transactions, balances, and movement history under one model.',
      },
      {
        title: 'Insight-ready records',
        description: 'Translate raw financial activity into stable inputs for tailored user experiences.',
      },
      {
        title: 'Trustworthy explanation',
        description: 'Keep the source, freshness, and supporting proof behind every financial insight.',
      },
    ],
    workflow: [
      { step: '01', title: 'Connect accounts', body: 'Bring external financial data and payment activity into a unified layer.' },
      { step: '02', title: 'Model user posture', body: 'Summarize balances, movement, and patterns into useful consumer-facing signals.' },
      { step: '03', title: 'Deliver insight', body: 'Power budgeting, forecasting, and financial guidance with better data underneath.' },
    ],
    relatedProducts: ['Open finance', 'Insight APIs', 'User experience layer'],
  },
  {
    slug: 'business-financial-management',
    title: 'Business financial management',
    description: 'Power tools for modern business finance',
    shortDescription: 'Give finance teams clearer cash, payout, and proof workflows across business accounts.',
    icon: 'business-finance',
    views: ['workflow'],
    eyebrow: 'Business finance',
    heroTitle: 'Power modern business finance with one layer for cash movement, proof, and control',
    heroBody:
      'ZORD helps finance and treasury teams move from fragmented bank portals and ops tools into a workflow where money movement and evidence stay together.',
    audience: 'Best for CFO teams, treasury operators, finance operations, and business banking products.',
    outcomes: [
      { label: 'Shared truth', value: 'Ops + Finance' },
      { label: 'Close speed', value: 'Faster' },
      { label: 'Proof readiness', value: 'Always on' },
    ],
    pillars: [
      {
        title: 'Cash movement visibility',
        description: 'See inbound and outbound bank activity, approvals, and exceptions in one operating surface.',
      },
      {
        title: 'Better finance closure',
        description: 'Reduce month-end noise by keeping final state and evidence connected.',
      },
      {
        title: 'Operator-first workflows',
        description: 'Build finance systems that support real review, not just dashboards and exports.',
      },
    ],
    workflow: [
      { step: '01', title: 'Track movement', body: 'Monitor bank and payout flows with context that finance can actually use.' },
      { step: '02', title: 'Resolve exceptions', body: 'Push the right exceptions into the right queue with the proof already attached.' },
      { step: '03', title: 'Close with confidence', body: 'Move into reconciliation, close, and audit with fewer manual rebuilds.' },
    ],
    relatedProducts: ['Business banking', 'Evidence Pack exports', 'Finance operations'],
  },
  {
    slug: 'earned-wage-access',
    title: 'Earned wage access',
    description: 'Offer early access to wages',
    shortDescription: 'Support wage-linked disbursals with cleaner approval, funding, and payout control.',
    icon: 'wages',
    views: ['workflow'],
    eyebrow: 'Wage-linked payouts',
    heroTitle: 'Offer early wage access with cleaner disbursal operations and stronger proof',
    heroBody:
      'ZORD helps earned wage access teams manage approvals, funding movement, and bank payouts through one operational surface instead of stitching payroll and payout tools together.',
    audience: 'Best for payroll-linked products, EWA platforms, HR fintech, and workforce payout providers.',
    outcomes: [
      { label: 'Payout speed', value: 'Faster' },
      { label: 'Exception queues', value: 'Controlled' },
      { label: 'Bank coverage', value: 'Multi-rail' },
    ],
    pillars: [
      {
        title: 'Faster wage-linked payouts',
        description: 'Move approved wages into reliable bank payout flows with less manual intervention.',
      },
      {
        title: 'Cleaner ops coordination',
        description: 'Align payroll, finance, and payout operations around one truth for each disbursal.',
      },
      {
        title: 'Defensible employee proof',
        description: 'Keep funding, approval, and finality evidence ready when support or finance asks questions.',
      },
    ],
    workflow: [
      { step: '01', title: 'Approve access', body: 'Validate wage eligibility, limits, and funding readiness.' },
      { step: '02', title: 'Dispatch payout', body: 'Route the wage disbursal through the healthiest bank path available.' },
      { step: '03', title: 'Confirm delivery', body: 'Close the loop with bank confirmation and support-ready proof.' },
    ],
    relatedProducts: ['Payroll', 'Outbound payouts', 'Employee proof'],
  },
  {
    slug: 'billing-recurring-payments',
    title: 'Billing & recurring payments',
    description: 'Boost successful payments for more revenue',
    shortDescription: 'Improve recurring payment performance with better collection, retry, and proof handling.',
    icon: 'billing',
    views: ['workflow'],
    eyebrow: 'Recurring revenue',
    heroTitle: 'Boost successful recurring payments with cleaner retries and clearer payment truth',
    heroBody:
      'Use ZORD to improve recurring payment performance across bank-led flows by making retries, confirmation state, and collections visibility much easier to operate.',
    audience: 'Best for SaaS, subscriptions, utilities, lending repayments, and recurring billing teams.',
    outcomes: [
      { label: 'Retry clarity', value: 'Structured' },
      { label: 'Payment truth', value: 'Workspace' },
      { label: 'Revenue lift', value: 'More success' },
    ],
    pillars: [
      {
        title: 'Higher recurring success',
        description: 'Use better signal and timing to keep more billing attempts successful.',
      },
      {
        title: 'Cleaner retry operations',
        description: 'Track what failed, why it failed, and whether retry logic is actually working.',
      },
      {
        title: 'Finance-ready payment proof',
        description: 'Connect recurring collections to reconciliation and support without patching over gaps later.',
      },
    ],
    workflow: [
      { step: '01', title: 'Initiate billing flow', body: 'Start the recurring payment with structured account and mandate context.' },
      { step: '02', title: 'Retry intelligently', body: 'Adjust retry timing and route based on signal quality and prior failure shape.' },
      { step: '03', title: 'Reconcile reliably', body: 'Confirm the final state quickly and move clean data into finance workflows.' },
    ],
    relatedProducts: ['Inbound bank payments', 'Connector performance', 'Collections proof'],
  },
]

export function getSolutionsForView(view: SolutionViewId) {
  return solutionEntries.filter((entry) => entry.views.includes(view))
}

export function getSolutionBySlug(slug: string) {
  return solutionEntries.find((entry) => entry.slug === slug)
}
