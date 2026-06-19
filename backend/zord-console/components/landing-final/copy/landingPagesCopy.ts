/** V1-honest copy shared across final-landing pages — no fake scale stats or testimonials. */

import { PAYOUT_COMMAND_HOLY_GRAIL as H } from '@/components/landing-final/copy/landingHolyGrailCopy'

export const landingPricingCopy = {
  eyebrow: 'Pricing',
  title: `Commercial clarity for ${H.productName}.`,
  description:
    `${H.productName} is sold as a payout operations workspace — sandbox to evaluate, then custom commercials for production rollout. Contact sales for pricing; no checkout or payroll SKUs on this product.`,
  heroStats: [
    { value: 'Sandbox', label: 'evaluate first' },
    { value: 'Custom', label: 'production commercials' },
    { value: 'Demo', label: 'guided rollout' },
  ] as const,
  product: {
    id: 'payment-command-center',
    label: H.productName,
    eyebrow: H.productName,
    kicker: 'Payout operations workspace',
    metric: 'Contact sales',
    detail:
      'Commercials are shaped around workspace depth, connector coverage, Evidence Pack workflows, and rollout support — not generic payment acceptance rates.',
    subdetail:
      'Start in sandbox to validate the operating model, then work with Arealis on production commercials when ops, finance, and engineering are ready.',
    highlights: [
      `${H.paymentCommandCenter.title}, ${H.pages.paymentGaps}, and ${H.connectorPerformance.title} views`,
      `${H.evidence.artifact}s for finance close, disputes, and audit questions`,
      H.askZord.title,
      'Sandbox preview before production commercials',
    ],
    stats: [
      ['Commercial model', 'Custom / volume-led'],
      ['Entry path', 'Sandbox + demo'],
      ['Best for', 'Ops, finance, engineering'],
    ] as const,
  },
  plans: [
    {
      title: 'Sandbox',
      subtitle: 'Best for evaluation and pilot teams',
      metric: 'No commitment',
      detail:
        'Explore the payout workspace, connector views, and Evidence Pack flows with illustrative data before production rollout.',
      points: ['Workspace preview', 'Product walkthrough', 'Technical fit review', 'Standard onboarding docs'],
    },
    {
      title: 'Growth',
      subtitle: 'Best for teams moving into production',
      metric: 'Annual agreement',
      detail:
        'Unlock production workspace access, implementation support, and a commercial review cadence once payout volume becomes an operating concern.',
      points: ['Production workspace', 'Implementation support', 'Commercial review cadence', 'Priority onboarding'],
      featured: true,
    },
    {
      title: 'Enterprise',
      subtitle: 'Best for regulated and high-volume programs',
      metric: 'Custom',
      detail:
        'Flexible commercials for security review, multi-team rollout, custom Evidence Pack workflows, and dedicated account coverage.',
      points: ['Volume-led pricing', 'Security review support', 'White-glove rollout', 'Dedicated account coverage'],
    },
  ] as const,
  faqs: [
    {
      question: `How is ${H.productName} priced?`,
      answer:
        'Pricing is custom and based on workspace usage, connector coverage, rollout depth, and support needs. There is no self-serve checkout rate on this product — teams start in sandbox and move to commercials with sales.',
    },
    {
      question: 'When should I contact sales?',
      answer:
        'Contact sales when you are ready for a guided demo, production rollout planning, security review, or a commercial discussion after sandbox evaluation.',
    },
    {
      question: 'Can I start in sandbox first?',
      answer:
        'Yes. Teams should begin in sandbox to validate the operating model, workspace fit, and Evidence Pack workflows before committing to production commercials.',
    },
    {
      question: 'Does this page include Payments, Payroll, or Banking pricing?',
      answer:
        `No. This page covers ${H.productName} only. Payments acceptance, payroll subscriptions, and banking products are not part of the V1 payout console commercial model.`,
    },
  ] as const,
} as const

export const buyerPersonas = [
  {
    title: 'Operations',
    role: 'Payout ops & support',
    body:
      'Needs one queue for connector drift, confirmation delays, and unconfirmed exposure — not three dashboards and a spreadsheet rebuild every incident.',
    tags: ['Exception queues', 'Connector watch', 'Batch review'],
  },
  {
    title: 'Finance',
    role: 'Close & reconciliation',
    body:
      'Needs Intended vs Bank-Confirmed value, Match Confidence, and exportable Evidence Packs before month-end questions turn into manual hunts.',
    tags: ['Value at Risk', 'Evidence Packs', 'Close readiness'],
  },
  {
    title: 'Engineering',
    role: 'Platform & integrations',
    body:
      'Needs a shared payout record across providers and banks so product teams stop rebuilding visibility in internal tools.',
    tags: ['Payment sources', 'Confirmation context', 'Shared record'],
  },
  {
    title: 'Risk & compliance',
    role: 'Review & audit',
    body:
      'Needs defensible proof attached to each payout state — not screenshots assembled after a dispute or regulator question arrives.',
    tags: ['Audit trail', 'Evidence Pack exports', 'Case context'],
  },
] as const
