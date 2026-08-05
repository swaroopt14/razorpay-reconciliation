import { DEMO_SMOKE_BATCH_ID, DEMO_WORKSPACE_NAME } from './ycDemoConstants'

/** Spec 7.16 - Ask Zord header + modes. */
export const ASK_ZORD_HEADER = {
  title: 'Ask Zord',
  subtitle: 'Investigate payouts, build safe workflows, and navigate the product.',
  tagline: 'AI on top of cryptographic truth - not instead of it.',
} as const

export type AskMode = 'ask' | 'act' | 'build'

export const ASK_MODES: { id: AskMode; label: string; hint: string }[] = [
  { id: 'ask', label: 'Ask', hint: 'Investigate with citations. No mutations.' },
  { id: 'act', label: 'Act', hint: 'Draft an action - preview before anything runs.' },
  { id: 'build', label: 'Build', hint: 'Draft workflow steps - activation stays human.' },
]

export type AskCitation = {
  id: string
  label: string
  objectKind: string
  href: string
  detail: string
}

export type AskAgentEvent = {
  id: string
  at: string
  actor: string
  action: string
  mode: AskMode
}

export type AskReply = {
  id: string
  mode: AskMode
  /** Scope line - rule 28. */
  scope: string
  finding: string
  /** Probabilistic / missing data notice - rule 34. */
  caveat?: string
  citations: AskCitation[]
  /** Previewed next step - never auto-executed. */
  suggestedActions: { label: string; href?: string; previewOnly?: boolean }[]
  /** For Act/Build - draft that requires confirmation. */
  draftPreview?: string
}

export const SLASH_COMMANDS = [
  {
    cmd: '/explain exception',
    summary: 'Short settlement - contract vs observed',
    example: '/explain exception PAY-0019',
  },
  {
    cmd: '/trace payment',
    summary: 'Open payment lifecycle with citations',
    example: '/trace PAY-0019',
  },
  {
    cmd: '/summarise batch',
    summary: 'Prepared demo batch health',
    example: `/summarise batch ${DEMO_SMOKE_BATCH_ID}`,
  },
  {
    cmd: '/compare expected actual',
    summary: 'Expected vs observed for a sealed contract',
    example: '/compare expected actual PAC-0019',
  },
  {
    cmd: '/verify proof',
    summary: 'Evidence pack coverage + integrity',
    example: '/verify proof EP-0001',
  },
] as const

const SCOPE_BASE = `${DEMO_WORKSPACE_NAME} · batch ${DEMO_SMOKE_BATCH_ID} · 12 Jun 2026`

function cite(
  id: string,
  label: string,
  objectKind: string,
  href: string,
  detail: string,
): AskCitation {
  return { id, label, objectKind, href, detail }
}

/** Resolve slash / natural language for sandbox demo - deterministic, cited, no auto-mutation. */
export function resolveAskZordDemo(prompt: string, mode: AskMode): AskReply {
  const p = prompt.trim()
  const lower = p.toLowerCase()

  const isTrace =
    lower.startsWith('/trace') ||
    lower.includes('trace payment') ||
    /pay-0019|zord_scn01_pay_011|pay-0001/.test(lower)
  const isExplain =
    lower.startsWith('/explain') ||
    lower.includes('explain exception') ||
    lower.includes('short') ||
    lower.includes('exception')
  const isSummarise = lower.startsWith('/summarise') || lower.startsWith('/summarize') || lower.includes('summarise batch')
  const isCompare = lower.startsWith('/compare') || lower.includes('expected') && lower.includes('actual')
  const isVerify = lower.startsWith('/verify') || lower.includes('verify proof') || lower.includes('evidence pack')

  if (isExplain || (!isTrace && !isSummarise && !isCompare && !isVerify && (lower.includes('short') || lower.includes('review')))) {
    return {
      id: `ask_${Date.now()}`,
      mode,
      scope: `${SCOPE_BASE} · objects: PAY-0019, PAC-0019, settlement credit UTR-8819000018`,
      finding:
        'I found one short-settled payout. The sealed Action Contract expected INR 3,500; the settlement record shows INR 3,395. The INR 105 difference is not explained by an authorised fee rule on the contract. Open the evidence or create a dispute pack?',
      caveat:
        'Root-cause ranking is probabilistic. Match class Short-settled is deterministic - Ask Zord cannot change it.',
      citations: [
        cite('c1', 'PAC-0019', 'Action Contract', '/contracts/PAC-0019?demo=sandbox', 'Sealed expected amount INR 3,500'),
        cite(
          'c2',
          'Settlement · UTR-8819000018',
          'Outcome signal',
          '/settlement/journal?demo=sandbox',
          'Observed credit INR 3,395',
        ),
        cite(
          'c3',
          'PAY-0019',
          'Outcome Review',
          '/settlement/review?demo=sandbox&gap=short_settled&focus=PAY-0019',
          'Short-settled exception row',
        ),
        cite('c4', 'EP-0019', 'Evidence pack', '/proof/EP-0019?demo=sandbox', 'Partial fee schedule missing'),
      ],
      suggestedActions: [
        { label: 'Open evidence', href: '/proof/EP-0019?demo=sandbox' },
        { label: 'Create dispute pack', href: '/settlement/review?demo=sandbox&gap=short_settled&focus=PAY-0019', previewOnly: true },
        { label: 'Open Outcome Review', href: '/settlement/review?demo=sandbox&gap=short_settled&focus=PAY-0019' },
      ],
      draftPreview:
        mode === 'act' || mode === 'build'
          ? 'Draft action (preview only): Assemble dispute pack citing PAC-0019, UTR-8819000018, and unexplained INR 105. Requires Approver confirmation - does not change match class.'
          : undefined,
    }
  }

  if (isTrace) {
    return {
      id: `ask_${Date.now()}`,
      mode,
      scope: `${SCOPE_BASE} · objects: PAY-0019 · PAC-0019 · dispatch · trace`,
      finding:
        'Payment PAY-0019 was sealed as PAC-0019, dispatched on NEFT, and credited short. Timeline: Intent → Policy passed → Contract sealed → Dispatch ack → Settlement observed → Outcome Short-settled.',
      caveat: 'Navigation only - no dispatch or seal from this answer.',
      citations: [
        cite('t1', 'PAY-0019 Trace', 'Payment Trace', '/payments/PAY-0019/trace?demo=sandbox', 'Full lifecycle timeline'),
        cite('t2', 'PAC-0019', 'Action Contract', '/contracts/PAC-0019?demo=sandbox', 'Sealed commercial boundary'),
        cite('t3', 'Dispatch', 'Dispatch Attempt', '/execution/dispatches?demo=sandbox', 'Provider acknowledgement'),
      ],
      suggestedActions: [
        { label: 'Open Trace', href: '/payments/PAY-0019/trace?demo=sandbox' },
        { label: 'Open Contract', href: '/contracts/PAC-0019?demo=sandbox' },
      ],
      draftPreview:
        mode === 'act'
          ? 'Draft (preview): Open Payment Trace for PAY-0019 and pin Outcome Review. No money movement.'
          : undefined,
    }
  }

  if (isSummarise) {
    return {
      id: `ask_${Date.now()}`,
      mode,
      scope: `${SCOPE_BASE} · 20 payouts`,
      finding:
        'Prepared batch: 17 exact settlements, 1 beneficiary-change blocked before dispatch (PAY-0020), 1 short settlement (PAY-0019), 1 return. Evidence: ≥1 complete P5 pack and 1 partial pack.',
      citations: [
        cite('b1', DEMO_SMOKE_BATCH_ID, 'Batch', '/payouts/intents?demo=sandbox', 'Primary demo batch'),
        cite('b2', 'PAY-0020', 'Control Review', '/controls/review?demo=sandbox', 'Blocked beneficiary change'),
        cite('b3', 'PAY-0019', 'Outcome Review', '/settlement/review?demo=sandbox&focus=PAY-0019', 'Short settlement'),
        cite('b4', 'EP-0001', 'Evidence pack', '/proof/EP-0001?demo=sandbox', 'Complete P5 pack'),
      ],
      suggestedActions: [
        { label: 'Open Intent Journal', href: '/payouts/intents?demo=sandbox' },
        { label: 'Open blocked row', href: '/controls/review?demo=sandbox' },
      ],
    }
  }

  if (isCompare) {
    return {
      id: `ask_${Date.now()}`,
      mode,
      scope: `${SCOPE_BASE} · PAC-0019 vs settlement`,
      finding:
        'Expected (sealed contract): INR 3,500 to BluePeak Marketing. Observed: INR 3,395 credited. Delta INR 105. Currency, beneficiary, and value date match; fee line is the unexplained field.',
      caveat: 'Zord verifies constraints - it does not manufacture the fee or rate.',
      citations: [
        cite('x1', 'PAC-0019', 'Action Contract', '/contracts/PAC-0019?demo=sandbox', 'Expected net'),
        cite('x2', 'Settlement journal', 'Outcome signal', '/settlement/journal?demo=sandbox', 'Observed credit'),
      ],
      suggestedActions: [
        { label: 'Open Outcome Review', href: '/settlement/review?demo=sandbox&focus=PAY-0019' },
      ],
    }
  }

  if (isVerify) {
    return {
      id: `ask_${Date.now()}`,
      mode,
      scope: `${SCOPE_BASE} · EP-0001`,
      finding:
        'Evidence pack EP-0001: integrity verified against sealed artefacts. Coverage is complete for the clean path (P5). Coverage is not a “proof score” - outcome and governance stay separate dimensions.',
      citations: [
        cite('p1', 'EP-0001', 'Evidence pack', '/proof/EP-0001?demo=sandbox', 'Summary · Evidence · Graph'),
        cite('p2', 'Proof Graph', 'Proof Graph', '/proof/EP-0001?demo=sandbox&tab=graph', 'Merkle / lineage view'),
      ],
      suggestedActions: [
        { label: 'Verify pack', href: '/proof/EP-0001?demo=sandbox&tab=verify' },
        { label: 'Open Proof Graph', href: '/proof/EP-0001?demo=sandbox&tab=graph' },
      ],
    }
  }

  return {
    id: `ask_${Date.now()}`,
    mode,
    scope: `${SCOPE_BASE} · general`,
    finding:
      'I can investigate sealed contracts, short settlements, traces, and evidence packs for this demo batch. Try /explain exception, /trace PAY-0019, /summarise batch, /compare expected actual, or /verify proof.',
    caveat: 'Insufficient specificity - name a payment, contract, or slash command for cited evidence.',
    citations: [
      cite('g1', 'Outcome Review', 'Outcome Review', '/settlement/review?demo=sandbox', 'Exceptions queue'),
      cite('g2', 'Proof Center', 'Evidence pack', '/proof?demo=sandbox', 'Packs for the batch'),
    ],
    suggestedActions: [
      { label: 'Run /explain exception', href: undefined },
      { label: 'Run /trace PAY-0019', href: undefined },
    ],
    draftPreview:
      mode === 'build'
        ? 'Draft workflow (preview): When Outcome = Short-settled → open Outcome Review → require fee artefact → create dispute pack. Activation requires Security/Approver - Ask Zord cannot activate.'
        : undefined,
  }
}

export const DEMO_AGENT_ACTIVITY: AskAgentEvent[] = [
  {
    id: 'ag1',
    at: '12 Jun · 16:13',
    actor: 'Ask Zord',
    action: 'Ranked root-cause candidates for PAY-0019 (non-binding)',
    mode: 'ask',
  },
  {
    id: 'ag2',
    at: '12 Jun · 16:14',
    actor: 'Ask Zord',
    action: 'Drafted dispute-pack preview - awaiting confirmation',
    mode: 'act',
  },
]
