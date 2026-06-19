/** V1-honest marketing copy for `/` home — aligned with PAYOUT_COMMAND_BLUE_COPY_INVENTORY_v2. */

import { PAYOUT_COMMAND_HOLY_GRAIL as H } from '@/components/landing-final/copy/landingHolyGrailCopy'

export const landingHomeCopy = {
  productPreviewLabel: 'Product preview — illustrative data',
  hero: {
    slides: [
      {
        id: 'control',
        tab: 'Control layer',
        icon: 'layers' as const,
        eyebrow: 'Unified payout visibility',
        headlineLead: 'See payout posture before',
        headlineTail: 'failures become finance fire drills',
        copy: `Give operations, finance, and engineering one workspace for payment instructions, bank/settlement confirmation, ${H.kpis.matchConfidence.toLowerCase()}, and ${H.evidence.artifact}s — instead of fragmented exports and confirmation gaps.`,
        highlights: [H.paymentCommandCenter.title, `Finance-ready ${H.evidence.artifact}s`, 'Shared workspace context'],
        panelLabel: 'Cross-functional visibility',
        panelTitle: 'Shared payout record',
        panelCopy: 'Instructions, confirmation state, matching gaps, and close-ready evidence stay aligned in one console.',
        panelCapabilities: [
          'Intended vs Bank-Confirmed value',
          'Match Confidence & payment gaps',
          'Proof Readiness',
          'Ask Zord About This Payment Data',
        ],
      },
      {
        id: 'marketplace',
        tab: 'Marketplace',
        icon: 'users' as const,
        eyebrow: 'Seller payout operations',
        headlineLead: 'Keep seller payouts',
        headlineTail: 'visible through sale spikes',
        copy: 'Spot connector drift, confirmation delays, and settlement gaps before support tickets and reconciliations pile up — using the same batch and connector signals ops and finance already need.',
        highlights: ['Seller exception visibility', 'Peak-day batch review', 'Connector performance signals'],
        panelLabel: 'Marketplace payout pulse',
        panelTitle: 'Seller-facing visibility',
        panelCopy: 'Support, ops, and finance work from the same payment record when traffic surges or a connector starts degrading.',
        panelCapabilities: [
          'Intent Journal by batch',
          'Unconfirmed exposure by connector',
          'Settlement Journal match status',
          'Evidence Packs for disputes',
        ],
      },
      {
        id: 'nbfc',
        tab: 'NBFC',
        icon: 'wallet' as const,
        eyebrow: 'Disbursals + treasury',
        headlineLead: 'Run disbursals with',
        headlineTail: 'treasury and close-ready control',
        copy: 'Track high-value disbursals across provider handoff, bank movement, pending finality, and Evidence Packs so treasury and finance are not waiting on manual answers.',
        highlights: ['High-value disbursal watch', 'Treasury confidence', 'Month-end evidence'],
        panelLabel: 'Disbursal confidence',
        panelTitle: 'High-value run visibility',
        panelCopy: `Track bank posture, ${H.kpis.unconfirmedExposure}, and ${H.evidence.proofReadiness} before treasury review and month-end close.`,
        panelCapabilities: [
          `${H.pages.paymentGaps}`,
          H.pages.borrowerVerification,
          H.pages.postDisbursalMonitoring,
          `Exportable ${H.evidence.artifact}s`,
        ],
      },
      {
        id: 'psp',
        tab: 'Payment Service Provider',
        icon: 'shield' as const,
        eyebrow: 'Provider + proof loop',
        headlineLead: 'Run fintech and PSP operations',
        headlineTail: 'with confirmation and evidence clarity',
        copy: 'Monitor connector performance, confirmation trust, bank acknowledgements, and Evidence Pack coverage while payment volume scales across rails and partners.',
        highlights: ['Confirmation trust', 'Connector performance view', 'Audit-ready evidence'],
        panelLabel: 'Payout evidence layer',
        panelTitle: 'Confirmation and evidence ops',
        panelCopy: 'Move from provider acknowledgement to bank movement to Evidence Packs without losing the trail between PSP ops, finance, and engineering.',
        panelCapabilities: [
          'Connector Performance & Leakage',
          'Match Review heatmap',
          'Settlement Journal linkage',
          'Evidence & Dispute Resolution',
        ],
      },
    ],
    exploreActions: [
      { label: H.paymentCommandCenter.title, icon: 'layers' as const },
      { label: 'Marketplace Ops', icon: 'users' as const },
      { label: 'NBFC Disbursals', icon: 'wallet' as const },
      { label: H.connectorPerformance.title, icon: 'shield' as const },
      { label: `${H.evidence.artifact}s`, icon: 'book' as const },
      { label: 'Explore More', icon: 'arrow-up-right' as const },
    ],
  },
  productHero: {
    badge: H.paymentCommandCenter.title,
    title: `One operating view for ${H.connectorPerformance.title.toLowerCase()}, escalation, and ${H.evidence.proofReadiness}.`,
    workingTitle: 'Start from the screen teams use when payout quality starts drifting.',
    workingBody:
      'This is where operators spot connector degradation, finance sees whether evidence is ready, and engineering understands whether the issue is provider-side, bank-side, or matching.',
    bullets: [
      'Connector posture, SLA pressure, and recommended actions stay visible in one frame.',
      'The same operating record supports review, reconciliation, and audit defense.',
      'Teams do not need to stitch dashboards, exports, and scattered confirmation notes to explain one payment state.',
    ],
    capabilityLabels: ['Payment instructions & confirmation', H.pages.matchingConfidence, `${H.evidence.artifact}s`],
  },
  switchboard: {
    eyebrow: 'Product preview',
    title: 'A control surface for payout posture',
    subcopy:
      'Scan connector health, rail posture, and bank hotspots in the same console layout teams use in sandbox and live workspaces.',
  },
  howItWorks: {
    title: 'The operating model behind control',
    body: 'Every payout moves through four stages so teams know where it is, what changed, and what evidence exists.',
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
        detail: 'Observe PSP outcomes, parse confidence, and connector performance — Zord does not dispatch payouts in V1.',
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
      description: `See which PSPs, banks, and rails need attention before ${H.kpis.preventableLeakage} spreads.`,
      bullets: ['Connector grid & health signals', `Leakage composition & ${H.kpis.unconfirmedExposure}`],
      icon: 'refresh' as const,
    },
    {
      title: 'Visibility & risk',
      description: 'Watch confirmation, SLA drift, and finality risk on one timeline.',
      bullets: [H.pages.matchingConfidence, `Payment gaps & ${H.kpis.valueAtRisk}`],
      icon: 'eye' as const,
    },
    {
      title: 'Evidence & finance',
      description: 'Close with Evidence Packs, not screenshots and scattered exports.',
      bullets: [`${H.evidence.artifact} generation`, 'Reconciliation clarity for finance'],
      icon: 'book' as const,
    },
  ],
  infrastructure: {
    title: 'The infrastructure layer buyers validate before rollout',
    subtitle:
      'Provider coverage, bank signal quality, and Evidence Pack readiness are what move a strong demo into an enterprise decision.',
    headline: 'Provider posture, bank response, and Evidence Pack readiness in one layer.',
    body: 'ZORD connects payment instructions, provider outcomes, bank-side movement, and finance-ready evidence so teams operate from one trusted payout record.',
    stats: [
      {
        eyebrow: 'Provider mesh',
        value: 'PSPs & rails',
        label: 'Connector posture',
        detail: `Observe primary and degraded connectors across ${H.kpis.totalVolumeProcessed} paths.`,
      },
      {
        eyebrow: 'Bank intelligence',
        value: 'Banks & settlement',
        label: 'Settlement visibility',
        detail: 'Confirmation trust, settlement drift, and hotspot monitoring from the same workspace.',
      },
      {
        eyebrow: 'Shared workspace',
        value: 'Ops + Finance',
        label: 'Shared payout context',
        detail: 'Operations and finance work from one payment record for review, close, and reconciliation.',
      },
      {
        eyebrow: 'Evidence layer',
        value: 'Evidence Packs',
        label: 'Audit readiness',
        detail: 'Export structured evidence without stitching screenshots, exports, and confirmation gaps across tools.',
      },
    ],
  },
  finalCta: {
    title: 'Move payouts with control, not guesswork',
    body: 'Book a ZORD walkthrough and see how processed volume, visibility, reconciliation, and Evidence Packs can sit in one enterprise operating layer.',
  },
  footer: {
    body: 'ZORD by Arealis helps businesses observe payout instructions reliably, track every state, and stay evidence-ready when money movement gets messy.',
  },
} as const
