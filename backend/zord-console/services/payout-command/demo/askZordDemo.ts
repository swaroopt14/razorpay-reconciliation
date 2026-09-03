import { DEMO_SMOKE_BATCH_ID, DEMO_WORKSPACE_NAME } from './ycDemoConstants'

/** Spec 7.16 - Ask Zord header + modes. */
export const ASK_ZORD_HEADER = {
  title: 'Ask Zord',
  subtitle: 'Investigate payouts, settlements, cash position, and evidence — AI on top of cryptographic truth.',
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
  scope: string
  finding: string
  caveat?: string
  citations: AskCitation[]
  suggestedActions: { label: string; href?: string; previewOnly?: boolean }[]
  draftPreview?: string
  /** Structured agent activity for the chat panel */
  activity?: string[]
}

export const SLASH_COMMANDS = [
  {
    cmd: '/settlement-status',
    summary: 'Where is this payment / settlement?',
    example: '/settlement-status pay_123',
  },
  {
    cmd: '/explain-variance',
    summary: 'Settlement-bank variance with exposure',
    example: '/explain-variance SET-0456',
  },
  {
    cmd: '/trace-payment',
    summary: 'Payment / payout lifecycle with sources',
    example: '/trace-payment pay_123',
  },
  {
    cmd: '/investigate-exception',
    summary: 'Failed payment + money movement',
    example: '/investigate-exception pay_123',
  },
  {
    cmd: '/cash-position',
    summary: 'Expected vs bank cash today',
    example: '/cash-position',
  },
  {
    cmd: '/forecast-cash',
    summary: 'Forward cash forecast',
    example: '/forecast-cash',
  },
  {
    cmd: '/match-tax',
    summary: 'Tax-line matcher',
    example: '/match-tax SET-0456',
  },
  {
    cmd: '/investigate-batch',
    summary: 'Batch recon + exception roll-up',
    example: '/investigate-batch batch_001',
  },
  {
    cmd: '/verify-proof',
    summary: 'SHA-256 + Merkle evidence pack',
    example: '/verify-proof EP-0456',
  },
  {
    cmd: '/is-money-lost',
    summary: 'Unresolved exposure vs confirmed loss',
    example: 'Is this money actually lost?',
  },
] as const

export const ASK_ZORD_EXAMPLE_QUESTIONS = [
  'Why is SET-0456 short by ₹25,000?',
  'Where is the money from PAY-0019?',
  "Show me today's unresolved exposure.",
  'Will I have enough cash tomorrow?',
  'Why did this payout fail?',
  'Which payouts need attention?',
  'Is this money actually lost?',
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

function reply(
  mode: AskMode,
  partial: Omit<AskReply, 'id' | 'mode'>,
): AskReply {
  return { id: `ask_${Date.now()}`, mode, ...partial }
}

/** Resolve slash / natural language for sandbox demo - deterministic, cited, no auto-mutation. */
export function resolveAskZordDemo(prompt: string, mode: AskMode): AskReply {
  const p = prompt.trim()
  const lower = p.toLowerCase()

  const moneyLost =
    lower.includes('money lost') ||
    lower.includes('actually lost') ||
    lower.includes('did we lose') ||
    lower.startsWith('/is-money-lost') ||
    lower.includes('missing ₹25') ||
    lower.includes('missing 25000')

  const cashPos =
    lower.startsWith('/cash-position') ||
    lower.includes('how much cash') ||
    lower.includes('cash should i have') ||
    (lower.includes('cash position') && !lower.includes('forecast'))

  const forecast =
    lower.startsWith('/forecast-cash') ||
    lower.includes('forecast') ||
    lower.includes('enough cash tomorrow') ||
    lower.includes('will i have enough')

  const tax =
    lower.startsWith('/match-tax') ||
    lower.includes('tax-line') ||
    lower.includes('tax line') ||
    (lower.includes('tax') && (lower.includes('match') || lower.includes('settlement')))

  const batch =
    lower.startsWith('/investigate-batch') ||
    lower.startsWith('/summarise') ||
    lower.startsWith('/summarize') ||
    lower.includes('reconcile this batch') ||
    lower.includes('summarise batch') ||
    lower.includes('batch_001')

  const settlementStatus =
    lower.startsWith('/settlement-status') ||
    lower.includes('is pay_123 settled') ||
    lower.includes('where is my money') ||
    (lower.includes('settled') && (lower.includes('pay_') || lower.includes('payment')))

  const variance =
    lower.startsWith('/explain-variance') ||
    lower.includes('set-0456') ||
    lower.includes('short by') ||
    lower.includes('settlement-bank') ||
    (lower.includes('variance') && !tax) ||
    lower.includes('why is today') ||
    lower.includes('reconciliation rate')

  const failedPay =
    lower.startsWith('/investigate-exception') ||
    (lower.includes('failed') && (lower.includes('money') || lower.includes('movement') || lower.includes('pay_123'))) ||
    lower.includes('failed payment')

  const payoutFail =
    lower.includes('pout_') ||
    (lower.includes('payout') && lower.includes('fail')) ||
    lower.includes('beneficiary_bank_down')

  const ambiguous =
    lower.includes('ambiguous') ||
    lower.includes('resolve this ambiguous')

  const exposure =
    lower.includes('unresolved exposure') ||
    lower.includes('biggest unresolved') ||
    lower.includes('need attention')

  const verify =
    lower.startsWith('/verify-proof') ||
    lower.startsWith('/verify') ||
    lower.includes('verify proof') ||
    lower.includes('merkle') ||
    lower.includes('prove that') ||
    lower.includes('evidence pack')

  const route =
    lower.includes('route recommendation') ||
    lower.includes('recommended route') ||
    (lower.includes('hdfc') && lower.includes('neft') && lower.includes('recommend'))

  const trace =
    lower.startsWith('/trace') ||
    lower.includes('trace payment') ||
    lower.includes('trace-payment') ||
    /pay-0019|zord_scn01_pay_011|pay-0001/.test(lower)

  if (moneyLost) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · SET-0456 · exposure ₹25,000`,
      finding: `No — loss is NOT proven.

What we know:

Expected settlement: ₹1,25,000
Bank credit:         ₹1,00,000
Variance:            ₹25,000

Provider status: processed
Reconciliation: VARIANCE

Evidence:
Settlement ✓
Bank ✓
Calculation ✓

Conclusion: ₹25,000 is currently unresolved financial exposure, not confirmed loss.
The evidence proves a settlement-bank variance but does not prove permanent financial loss.`,
      caveat: 'Provider status stays processed. Do not rewrite Razorpay status to UNRESOLVED.',
      activity: [
        'Retrieved settlement SET-0456',
        'Retrieved bank credit',
        'Compared expected vs actual',
        'Verified calculation trace',
        'Classified as unresolved exposure — not loss',
      ],
      citations: [
        cite('ml1', 'SET-0456', 'Settlement', '/settlements?demo=sandbox', 'Expected net ₹1,25,000'),
        cite('ml2', 'Bank credit', 'Bank', '/connections?demo=sandbox', 'Observed ₹1,00,000'),
        cite('ml3', 'Exceptions', 'Exception', '/exceptions?demo=sandbox', 'Settlement-bank variance'),
        cite('ml4', 'EP-0456', 'Evidence pack', '/proof?demo=sandbox', 'SHA-256 + Merkle verified'),
      ],
      suggestedActions: [
        { label: 'Open exceptions', href: '/exceptions?demo=sandbox' },
        { label: 'View evidence', href: '/proof?demo=sandbox' },
        { label: 'Cash position', href: '/cash-position' },
      ],
    })
  }

  if (cashPos) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · Cash Position · 4 Sep`,
      finding: `Cash position — today

Opening cash              ₹8,50,000
Expected settlements     +₹4,20,000
Expected payouts         -₹2,10,000
Expected refunds         -₹35,000
Fees / tax               -₹28,000
                          ─────────
Expected closing         ₹9,97,000

Actual bank position      ₹9,72,000
Variance                  ₹25,000

Your expected cash is ₹9.97L while observed bank cash is ₹9.72L. The ₹25,000 difference corresponds to settlement SET-0456 (settlement exceeds observed bank credit).`,
      activity: [
        'Loaded opening cash',
        'Summed expected settlements',
        'Subtracted approved payouts / fees / tax',
        'Compared to bank-proven cash',
        'Linked variance to SET-0456',
      ],
      citations: [
        cite('cp1', 'Cash Position', 'Cash Position', '/cash-position', 'Expected vs actual'),
        cite('cp2', 'SET-0456', 'Settlement', '/settlements?demo=sandbox', '₹25,000 variance'),
        cite('cp3', 'Exceptions', 'Exception', '/exceptions?demo=sandbox', 'Unresolved exposure'),
      ],
      suggestedActions: [
        { label: 'Open Cash Position', href: '/cash-position' },
        { label: 'Investigate SET-0456', href: '/exceptions?demo=sandbox' },
        { label: 'Run /forecast-cash' },
      ],
    })
  }

  if (forecast) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · Forward cash forecast`,
      finding: `Forward cash forecast

Today       ₹9.72L
Tomorrow   ₹11.15L
+2 days    ₹12.40L
+3 days    ₹10.85L
+7 days    ₹14.20L

Forecast confidence: 91%

Known:
✓ Scheduled settlements
✓ Known payouts
✓ Known refunds

Uncertainty:
₹25,000 unresolved settlement exposure (SET-0456)

Cash is expected to increase tomorrow primarily from pending settlements.`,
      citations: [
        cite('fc1', 'Cash Position', 'Forecast', '/cash-position', 'Forward forecaster tab'),
        cite('fc2', 'Pending settlements', 'Settlement', '/settlements?demo=sandbox', 'In-flight inflows'),
      ],
      suggestedActions: [
        { label: 'Open Cash Position', href: '/cash-position' },
        { label: 'View settlements', href: '/settlements?demo=sandbox' },
      ],
    })
  }

  if (tax) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · Tax-line matcher`,
      finding: `Tax-line match for settlement

Gross:             ₹1,25,000
Processing fee:    -₹2,500
GST:               -₹450
Adjustment:        -₹550

Expected net:      ₹1,21,500
Bank credit:       ₹1,21,500

Result: EXACT MATCH ✓

Settlement tax, ledger tax, and expected tax agree. Cryptographic proof stays on the evidence pack.`,
      citations: [
        cite('tx1', 'Tax matching', 'Cash Position', '/cash-position', 'Tax-Line Matcher'),
        cite('tx2', 'Settlement', 'Settlement', '/settlements?demo=sandbox', 'Fee + GST lines'),
        cite('tx3', 'EP tax calc', 'Evidence', '/proof?demo=sandbox', 'Calculation trace sealed'),
      ],
      suggestedActions: [
        { label: 'Open Tax matcher', href: '/cash-position' },
        { label: 'View evidence', href: '/proof?demo=sandbox' },
      ],
    })
  }

  if (batch) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · batch_001 · 100 records`,
      finding: `Batch: batch_001

100 records processed

92 MATCHED
3 VARIANCE
2 FAILED + MONEY MOVEMENT
1 AMBIGUOUS
1 MISSING SETTLEMENT
1 UTR CONFLICT

Match rate: 92%
Exception rate: 8%
Financial exposure: ₹38,150

8 exceptions → 6 resolved (₹27,000) · 2 unresolved (₹11,150)

92% deterministic reconciliation rate. 6/8 exceptions resolved with evidence. ₹11,150 remains unresolved exposure.`,
      activity: [
        'Scored 100 recon rows',
        'Bucketed MATCHED / VARIANCE / AMBIGUOUS / CONFLICTED',
        'Investigated 8 exceptions',
        'Resolved 6 with evidence',
        'Left 2 as unresolved exposure',
      ],
      citations: [
        cite('b1', 'Reconciliation', 'Recon', '/reconciliation?demo=sandbox', '92% match rate'),
        cite('b2', 'Exceptions', 'Exception', '/exceptions?demo=sandbox', '8 open issues'),
        cite('b3', DEMO_SMOKE_BATCH_ID, 'Batch', '/transactions?demo=sandbox', 'Primary demo batch'),
      ],
      suggestedActions: [
        { label: 'Open Reconciliation', href: '/reconciliation?demo=sandbox' },
        { label: 'Open Exceptions', href: '/exceptions?demo=sandbox' },
        { label: 'Investigations', href: '/investigations?demo=sandbox' },
      ],
    })
  }

  if (settlementStatus && !variance) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · pay_123`,
      finding: `Payment: pay_123
Amount: ₹10,000

Provider status: captured
Settlement status: processed
Bank credit: ₹9,850

Expected net: ₹9,850
Actual bank credit: ₹9,850

Result: SETTLED ✓

Settlement: set_456
Bank reference: HDFC-UTR-12345
Evidence: Verified`,
      activity: [
        'Identified payment pay_123',
        'Fetched payment / settlement / bank',
        'Compared expected vs actual',
        'Verified evidence pack',
      ],
      citations: [
        cite('s1', 'pay_123', 'Payment', '/reconciliation?demo=sandbox', 'Provider status captured'),
        cite('s2', 'set_456', 'Settlement', '/settlements?demo=sandbox', 'Processed'),
        cite('s3', 'HDFC-UTR-12345', 'Bank', '/connections?demo=sandbox', 'Credit ₹9,850'),
        cite('s4', 'Evidence', 'Proof', '/proof?demo=sandbox', 'Verified'),
      ],
      suggestedActions: [
        { label: 'View settlement', href: '/settlements?demo=sandbox' },
        { label: 'View evidence', href: '/proof?demo=sandbox' },
      ],
    })
  }

  if (variance) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · SET-0456 · VARIANCE`,
      finding: `Today's batch (if asked for rate)
────────────────────────
100 records · 94 MATCHED · 2 AMBIGUOUS · 3 UNRESOLVED · 1 CONFLICTED
Reconciliation rate: 94% · Exposure: ₹27,150

Largest exception — SET-0456

Expected net: ₹1,25,000
Bank credit:   ₹1,00,000
Variance:      ₹25,000

Provider status: processed
Reconciliation: VARIANCE

Evidence: ✓ Settlement · ✓ Bank · ✓ Calculation · ✓ Evidence pack

Conclusion: ₹25,000 is unresolved exposure.
This is NOT confirmed financial loss.`,
      caveat: 'Razorpay provider status remains processed. Reconciliation = VARIANCE is a separate control layer.',
      activity: [
        'Retrieved settlement',
        'Retrieved bank transaction',
        'Compared expected vs actual',
        'Retrieved evidence pack',
        'Verified calculation trace',
      ],
      citations: [
        cite('v1', 'SET-0456', 'Settlement', '/settlements?demo=sandbox', 'Expected ₹1,25,000'),
        cite('v2', 'Bank', 'Bank', '/connections?demo=sandbox', 'Credited ₹1,00,000'),
        cite('v3', 'Reconciliation', 'Recon', '/reconciliation?demo=sandbox', 'VARIANCE'),
        cite('v4', 'EP-0456', 'Evidence', '/proof?demo=sandbox', 'Pack verified'),
      ],
      suggestedActions: [
        { label: 'Settlement', href: '/settlements?demo=sandbox' },
        { label: 'Bank / Connections', href: '/connections' },
        { label: 'Reconciliation', href: '/reconciliation?demo=sandbox' },
        { label: 'Evidence', href: '/proof?demo=sandbox' },
      ],
    })
  }

  if (failedPay) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · pay_123 · failed + bank movement`,
      finding: `Payment: pay_123
Amount: ₹10,000

Provider status: failed

Investigation path:
Payment → Webhooks → Bank → Refunds → Settlement → Ledger

Findings:
Payment: FAILED
Bank movement: ₹10,000 CREDIT observed
Settlement: none
Refund: none

Result: FAILED PAYMENT + MONEY MOVEMENT
Exposure: ₹10,000
Root cause: UNKNOWN

The payment provider reports failure, but a corresponding financial movement exists without a settlement or refund that accounts for it.

Recommended:
1. Investigate bank transaction
2. Verify UTR
3. Check provider event history
4. Search refund records
5. Do not mark reconciled

Status remains:
Razorpay: failed
Reconciliation: UNRESOLVED`,
      caveat: 'Never overwrite Razorpay failed with a recon status.',
      activity: [
        'Read provider status failed',
        'Scanned bank credits',
        'Checked refunds / settlement',
        'Opened investigation INV-001',
      ],
      citations: [
        cite('fp1', 'pay_123', 'Payment', '/reconciliation?demo=sandbox', 'Provider failed'),
        cite('fp2', 'Bank credit', 'Bank', '/connections', '₹10,000 unexplained'),
        cite('fp3', 'INV-001', 'Investigation', '/investigations?demo=sandbox', 'Agent checklist'),
        cite('fp4', 'Exception', 'Exception', '/exceptions?demo=sandbox', 'Failed + money movement'),
      ],
      suggestedActions: [
        { label: 'Open investigation', href: '/investigations?demo=sandbox' },
        { label: 'Open exception', href: '/exceptions?demo=sandbox' },
        { label: 'Ask: Is money lost?' },
      ],
    })
  }

  if (payoutFail) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · pout_123 · HDFC NEFT`,
      finding: `Payout: pout_123
Amount: ₹1,72,347.78

Provider: HDFC Bank
Rail: NEFT
Provider status: failed
Reason: beneficiary_bank_down

Bank movement: None observed

Result: Financially accounted for
Exposure: ₹0

Razorpay status: failed
Financial reconciliation: No unexplained money movement found.

Conclusion: The payout failed before a corresponding bank debit was observed.`,
      citations: [
        cite('po1', 'pout_123', 'Payout', '/payouts?demo=sandbox', 'Provider failed'),
        cite('po2', 'HDFC · NEFT', 'Connections', '/connections', 'Rail health'),
        cite('po3', 'Lifecycle', 'Trace', '/reconciliation?demo=sandbox', 'Source-aware timeline'),
      ],
      suggestedActions: [
        { label: 'Open Payouts', href: '/payouts?demo=sandbox' },
        { label: 'Connections', href: '/connections' },
      ],
    })
  }

  if (ambiguous) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · ambiguous bank candidates`,
      finding: `Settlement: ₹50,000 · Date: 12 Jun

Candidate bank transactions:
1. ₹50,000 · HDFC · UTR ABC123 · Score 0.94
2. ₹50,000 · HDFC · UTR XYZ456 · Score 0.91
3. ₹49,980 · HDFC · Score 0.72

Result: AMBIGUOUS

I cannot safely select a bank transaction.
Two candidates have materially similar evidence.

Recommendation: Manual review required.`,
      caveat: 'Responsible AI — no automatic attach when evidence is materially tied.',
      citations: [
        cite('am1', 'Reconciliation', 'AMBIGUOUS', '/reconciliation?demo=sandbox', 'Needs review'),
        cite('am2', 'Exceptions', 'Exception', '/exceptions?demo=sandbox', 'UTR conflict / ambiguous'),
      ],
      suggestedActions: [
        { label: 'Open Reconciliation', href: '/reconciliation?demo=sandbox' },
        { label: 'Manual review', href: '/exceptions?demo=sandbox', previewOnly: true },
      ],
    })
  }

  if (exposure) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · unresolved exposure`,
      finding: `Top unresolved exposure

1. SET-0456 · Settlement-bank variance · ₹25,000 · HIGH
2. PAY-123 · Failed payment + money movement · ₹10,000 · HIGH
3. PAY-UTR-001 · UTR conflict · ₹2,000 · MEDIUM

Total unresolved exposure: ₹37,000`,
      citations: [
        cite('ex1', 'Exceptions', 'Exception inbox', '/exceptions?demo=sandbox', 'Sorted by severity'),
        cite('ex2', 'Cash Position', 'Exposure', '/cash-position', 'Unresolved KPI'),
      ],
      suggestedActions: [
        { label: 'Open Exceptions', href: '/exceptions?demo=sandbox' },
        { label: 'Investigate ₹25,000', href: '/investigations?demo=sandbox' },
      ],
    })
  }

  if (verify) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · EP-0456`,
      finding: `Evidence verification

Settlement: SET-0456

Evidence items:
✓ Original settlement record
✓ Canonical observation
✓ Bank transaction
✓ Match decision
✓ Calculation trace
✓ Investigation result

SHA-256: Verified
Merkle root: Verified
Evidence pack: EP-0456
Integrity: VERIFIED

Cryptographic integrity proves the pack has not changed; it does not independently prove that upstream bank/source data itself was truthful.`,
      citations: [
        cite('p1', 'EP-0456', 'Evidence pack', '/proof?demo=sandbox', 'Summary · Graph · Verify'),
        cite('p2', 'Merkle root', 'Proof Graph', '/proof?demo=sandbox', 'Lineage to root'),
      ],
      suggestedActions: [
        { label: 'Open Proof Center', href: '/proof?demo=sandbox' },
        { label: 'Verify pack', href: '/proof?demo=sandbox' },
      ],
    })
  }

  if (route) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · bulk route recommendation`,
      finding: `AI ROUTE RECOMMENDATION

Batch: BATCH-001 · 2,450 payouts · ₹1.72 Cr

Recommended: HDFC Bank · NEFT
Confidence: 94%

Why?
✓ Highest current rail availability
✓ Contract-compatible
✓ Within payout limits
✓ Expected T+0/T+1 banking window

Provider status stays pending until Approve & Dispatch.
AI must not silently dispatch.`,
      citations: [
        cite('r1', 'Payouts', 'Bulk dispatch', '/payouts?demo=sandbox', 'Upload → AI recommend'),
        cite('r2', 'HDFC', 'Connections', '/connections', 'Rail healthy'),
      ],
      suggestedActions: [
        { label: 'Open Payouts', href: '/payouts?demo=sandbox' },
        { label: 'Review route', href: '/payouts?demo=sandbox', previewOnly: true },
      ],
      draftPreview:
        mode === 'act' || mode === 'build'
          ? 'Draft (preview only): Approve HDFC NEFT for remaining payouts. Requires merchant confirmation — no auto-dispatch.'
          : undefined,
    })
  }

  if (trace) {
    return reply(mode, {
      scope: `${SCOPE_BASE} · objects: PAY-0019 · lifecycle`,
      finding:
        'Payment PAY-0019 was sealed, dispatched on NEFT, and credited short. Timeline: Intent → Policy → Contract → AI route → Dispatch → Provider → Bank → Reconciliation → Evidence.',
      caveat: 'Navigation only - no dispatch or seal from this answer.',
      citations: [
        cite('t1', 'PAY-0019', 'Lifecycle', '/reconciliation?demo=sandbox', 'Source-aware timeline'),
        cite('t2', 'Evidence', 'Proof', '/proof?demo=sandbox', 'SHA-256 pack'),
      ],
      suggestedActions: [
        { label: 'Open Reconciliation', href: '/reconciliation?demo=sandbox' },
        { label: 'Open Evidence', href: '/proof?demo=sandbox' },
      ],
    })
  }

  return reply(mode, {
    scope: `${SCOPE_BASE} · Finance Controller`,
    finding:
      'I can investigate settlements, variances, failed payments with bank movement, cash position, tax lines, batches, and evidence packs. Try a slash command or ask: “Why is SET-0456 short by ₹25,000?” / “Is this money actually lost?” / “Will I have enough cash tomorrow?”',
    caveat: 'Insufficient specificity — name a payment, settlement, or slash command for cited evidence.',
    citations: [
      cite('g1', 'Exceptions', 'Exception', '/exceptions?demo=sandbox', 'Unresolved exposure'),
      cite('g2', 'Cash Position', 'Cash', '/cash-position', 'Expected vs actual'),
      cite('g3', 'Proof Center', 'Evidence', '/proof?demo=sandbox', 'Merkle verification'),
    ],
    suggestedActions: [
      { label: 'Run /explain-variance SET-0456' },
      { label: 'Run /cash-position' },
      { label: 'Run /is-money-lost' },
    ],
    draftPreview:
      mode === 'build'
        ? 'Draft workflow (preview): When recon = VARIANCE → open Exceptions → require evidence pack → create investigation. Activation requires Approver — Ask Zord cannot activate.'
        : undefined,
  })
}

export const DEMO_AGENT_ACTIVITY: AskAgentEvent[] = [
  {
    id: 'ag1',
    at: 'Just now',
    actor: 'Ask Zord',
    action: 'Explained SET-0456 settlement-bank variance (₹25,000 unresolved exposure)',
    mode: 'ask',
  },
  {
    id: 'ag2',
    at: '12 Jun · 16:14',
    actor: 'Ask Zord',
    action: 'Cash position: linked ₹25,000 variance to SET-0456',
    mode: 'ask',
  },
  {
    id: 'ag3',
    at: '12 Jun · 16:10',
    actor: 'Ask Zord',
    action: 'Investigated failed payment + bank movement — INV-001',
    mode: 'ask',
  },
]
