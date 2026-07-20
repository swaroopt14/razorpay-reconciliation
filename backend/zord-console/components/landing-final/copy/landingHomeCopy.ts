/** V1-honest marketing copy for `/` home, aligned with PAYOUT_COMMAND_BLUE_COPY_INVENTORY_v2. */

import { PAYOUT_COMMAND_HOLY_GRAIL as H } from '@/components/landing-final/copy/landingHolyGrailCopy'

export const landingHomeCopy = {
  productPreviewLabel: 'Product preview, illustrative data',
  hero: {
    slides: [
      {
        eyebrow: 'Get started',
        headlineLead: 'Move payouts with control,',
        headlineTail: 'not guesswork',
      },
    ],
  },
  featuresSection: {
    subcopy:
      'One operating layer for payment instructions, connector posture, and evidence readiness, from command center through finance close.',
  },
  howItWorks: {
    stages: [
      {
        step: '01',
        label: 'Intent capture',
        detail: 'Capture payment instructions with amount, beneficiary, and batch context.',
        footnote: 'Instruction file',
      },
      {
        step: '02',
        label: 'Provider observation',
        detail: 'Observe PSP outcomes, parse confidence, and connector performance, Zord does not dispatch payouts in V1.',
        footnote: 'Connector performance',
      },
      {
        step: '03',
        label: 'Bank confirmation',
        detail: 'Track settlement files, bank movement, and match status without blind spots.',
        footnote: H.journals.settlementJournal,
      },
      {
        step: '04',
        label: 'Evidence export',
        detail: 'Package intents, settlements, and audit evidence into Evidence Packs finance can close on.',
        footnote: H.evidence.artifact,
      },
    ],
  },
  capabilities: [
    {
      title: H.connectorPerformance.title,
      description: `See which PSPs, banks, and rails need attention before ${H.kpis.preventableLeakage} becomes an incident.`,
    },
    {
      title: 'Visibility & risk',
      description: 'Watch confirmation, SLA drift, and finality risk on one shared timeline.',
    },
    {
      title: 'Evidence & finance',
      description: 'Close with Evidence Packs, not screenshots and scattered exports.',
    },
  ],
  finalCta: {
    title: 'Move payouts with control, not guesswork',
  },
} as const
