/** Plain fintech business copy for `/` home - aligned with landing page .md. */

export const landingHomeCopy = {
  productPreviewLabel: 'Product preview - sample workspace data',
  hero: {
    slides: [
      {
        eyebrow: 'Payout operations',
        headlineLead: 'See, check, and prove',
        headlineTail: 'every payout',
      },
    ],
  },
  featuresSection: {
    subcopy:
      'One shared place for the money you meant to pay, what the bank confirmed, the gaps in between, and the proof finance can stand behind.',
  },
  howItWorks: {
    stages: [
      {
        step: '01',
        label: 'Bring in payment instructions',
        detail: 'Upload the payment file your business meant to pay - amounts, payees, and batch context in one record.',
        footnote: 'Payment file',
      },
      {
        step: '02',
        label: 'Organize as a batch',
        detail: 'Group instructions into a batch so ops can follow progress from intake through confirmation and proof.',
        footnote: 'Batch',
      },
      {
        step: '03',
        label: 'Match bank confirmations',
        detail: 'Add settlement or bank files, then match what was supposed to happen with what was confirmed - and flag what needs review.',
        footnote: 'Settlement journal',
      },
      {
        step: '04',
        label: 'Export proof',
        detail: 'Build a proof pack finance and audit can use - not screenshots scattered across tools.',
        footnote: 'Proof pack',
      },
    ],
  },
  capabilities: [
    {
      title: 'See where money stands',
      description: 'See what you meant to pay next to what the bank confirmed. Spot missing amounts before month-end.',
    },
    {
      title: 'Clear up mismatches',
      description: 'When numbers do not line up, put them on a review list so someone can decide what to do next.',
    },
    {
      title: 'Prove what happened',
      description: 'Hand finance one proof pack - from the original payment instruction through bank confirmation.',
    },
  ],
  finalCta: {
    title: 'One place to explain your payouts',
  },
} as const
