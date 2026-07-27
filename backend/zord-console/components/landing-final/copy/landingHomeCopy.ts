/** V1-honest marketing copy for `/` home, aligned with PAYOUT_COMMAND_BLUE_COPY_INVENTORY_v2. */

import { PAYOUT_COMMAND_HOLY_GRAIL as H } from '@/components/landing-final/copy/landingHolyGrailCopy'

export const landingHomeCopy = {
  productPreviewLabel: 'Product preview, illustrative data',
  hero: {
    slides: [
      {
        eyebrow: 'PAYMENT INTEGRITY FOR GLOBAL ENTERPRISES',
        headlineLead: 'Prove every payout from',
        headlineTail: 'authorisation to settlement',
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
        label: 'Capture the authorised obligation',
        detail: 'Capture payment instructions with amount, beneficiary, and batch context.',
        footnote: 'Payment obligation',
      },
      {
        step: '02',
        label: 'Create the Payment Action Contract',
        detail: 'Validate authority, beneficiary, duplicate risk, commercial terms and policy before sealing the instruction.',
        footnote: 'Govern and seal',
      },
      {
        step: '03',
        label: 'Trace execution across systems',
        detail: 'Connect bank, PSP, ledger, webhook and settlement signals to the original authorised contract.',
        footnote: H.journals.settlementJournal,
      },
      {
        step: '04',
        label: 'Prove the final outcome',
        detail: 'Export a tamper-evident lifecycle record that another party can independently inspect and verify.',
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
    title: 'See how an authorised payout becomes verifiable settlement',
  },
} as const
