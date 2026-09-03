/** Everyday fintech language shared across final-landing pages. No fake stats or testimonials. */

export const landingPricingCopy = {
  eyebrow: 'Pricing',
  title: 'Clear pricing for Zord.',
  description:
    'Try first with sample data, book a demo when you are ready, then set production pricing with Arealis. No public checkout rates - Zord is a place to see and prove payouts, not a payment gateway plan.',
  heroStats: [
    { value: 'Try first', label: 'sample data' },
    { value: 'Demo', label: 'guided walkthrough' },
    { value: 'Custom', label: 'production pricing' },
  ] as const,
  product: {
    id: 'payment-command-center',
    label: 'Payout workspace',
    eyebrow: 'Zord',
    kicker: 'One place for payout work',
    metric: 'Talk to sales',
    detail:
      'Pricing follows how your teams use Zord, how widely you roll it out, and how much help you need - not card acceptance rates.',
    subdetail:
      'Try with sample data first. When ops and finance are ready, Arealis helps set production pricing.',
    highlights: [
      'See batches, spot gaps, and clear mismatches in one place',
      'Proof packs for finance close, disputes, and audit questions',
      'Ask Zord about your payout data in plain language',
      'Try with sample data before you talk pricing',
    ],
    stats: [
      ['Pricing', 'Custom'],
      ['Start with', 'Try first + demo'],
      ['Best for', 'Ops, finance, risk'],
    ] as const,
  },
  plans: [
    {
      title: 'Try first',
      subtitle: 'Best for teams evaluating fit',
      metric: 'No commitment',
      detail:
        'Explore the payout workspace and proof-pack flows with sample data before you commit to production.',
      points: ['Workspace preview', 'Product walkthrough', 'Fit review', 'Getting-started guides'],
    },
    {
      title: 'Growth',
      subtitle: 'Best for teams going live',
      metric: 'Annual agreement',
      detail:
        'Live workspace access, onboarding help, and a regular pricing check-in once payouts are day-to-day work.',
      points: ['Live workspace', 'Setup support', 'Pricing check-ins', 'Priority onboarding'],
      featured: true,
    },
    {
      title: 'Enterprise',
      subtitle: 'Best for regulated and high-volume programs',
      metric: 'Custom',
      detail:
        'Flexible pricing for security review, multi-team go-live, tailored proof packs, and a dedicated account contact.',
      points: ['Volume-based pricing', 'Security review help', 'Guided go-live', 'Dedicated account contact'],
    },
  ] as const,
  faqs: [
    {
      question: 'How is Zord priced?',
      answer:
        'Pricing is custom. It depends on how you use the workspace, how widely you use it, and how much support you need. There is no self-serve checkout - teams try first, then talk to sales.',
    },
    {
      question: 'When should I contact sales?',
      answer:
        'Contact sales when you want a guided demo, a plan for going live, a security review, or a pricing talk after you have tried the product.',
    },
    {
      question: 'Can I try first?',
      answer:
        'Yes. Start with sample data to try batch tracking, matching, and proof packs before you commit to production pricing.',
    },
    {
      question: 'Does this page include Payments, Payroll, or Banking product pricing?',
      answer:
        'No. This page covers Zord only - the shared place to see and prove payouts. Card acceptance, payroll subscriptions, and banking products are separate.',
    },
  ] as const,
} as const

/** Who uses Zord - job problems only. No named customers or fake outcomes. */
export const buyerPersonas = [
  {
    title: 'Finance',
    role: 'Close & reconciliation',
    body:
      'Needs a clear view of money meant to pay versus money the bank confirmed - plus a proof pack before month-end questions turn into manual hunts.',
    tags: ['Meant to pay vs confirmed', 'Proof packs', 'Ready for close'],
  },
  {
    title: 'Operations',
    role: 'Payout ops & support',
    body:
      'Needs one place to track batches, spot confirmation delays, and clear unclear matches - without rebuilding spreadsheets every time.',
    tags: ['Batch tracking', 'Payment gaps', 'Needs a person'],
  },
  {
    title: 'Engineering',
    role: 'Platform & integrations',
    body:
      'Needs one shared payout record across banks and payment providers so teams stop rebuilding the same status in internal tools.',
    tags: ['Shared record', 'Banks & providers', 'Bank confirmations'],
  },
  {
    title: 'Risk & compliance',
    role: 'Review & audit',
    body:
      'Needs proof attached to each payout conclusion - not screenshots assembled after a dispute or audit question arrives.',
    tags: ['Full payment trail', 'Export proof packs', 'Clear reasons'],
  },
  {
    title: 'Audit',
    role: 'Independent review',
    body:
      'Needs to follow a payment from the original instruction through bank confirmation, matching, and proof in one trail.',
    tags: ['Full payment trail', 'Proof', 'One record'],
  },
  {
    title: 'Leadership',
    role: 'Payout health overview',
    body:
      'Needs a simple view of payout health: what was meant to pay, what was confirmed, and where money is still unclear.',
    tags: ['Simple status view', 'Trends', 'Open amounts'],
  },
] as const
