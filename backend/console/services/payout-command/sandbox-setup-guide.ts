import { PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH } from './batchCommandCenterHref'
import {
  DEMO_SMOKE_BATCH_ID,
  DEMO_WORKSPACE_NAME,
  demoBatchHref,
} from './demo/ycDemoConstants'

/** Persisted when user dismisses the Intent Journal auto-open setup dialog. */
export const SANDBOX_JOURNAL_SETUP_DISMISSED_KEY = 'zord:sandbox-intent-journal-onboarding-dismissed'

export const SANDBOX_SETUP_PANEL_DISMISSED_KEY = 'zord:sandbox-setup-panel-dismissed'
export const SANDBOX_SETUP_PANEL_MINIMIZED_KEY = 'zord:sandbox-setup-panel-minimized'
export const SANDBOX_SETUP_PROGRESS_STORAGE_KEY = 'zord:sandbox-setup-progress'

/**
 * Spec Part 10 - 3-minute guided path progress (rules 35-45).
 * Legacy keys kept so older markSandboxSetupStep calls still resolve.
 */
export type SandboxSetupProgress = {
  overview?: boolean
  connections?: boolean
  create?: boolean
  journal?: boolean
  review?: boolean
  contract?: boolean
  dispatch?: boolean
  'settlement-journal'?: boolean
  outcome?: boolean
  proof?: boolean
  ask?: boolean
  /** @deprecated → create */
  'intent-ingest'?: boolean
  /** @deprecated → settlement-journal */
  settlement?: boolean
  /** @deprecated → overview */
  'home-signals'?: boolean
}

/** Map legacy progress marks onto Spec Part 10 step ids. */
const PROGRESS_ALIASES: Record<string, keyof SandboxSetupProgress> = {
  'intent-ingest': 'create',
  settlement: 'settlement-journal',
  'home-signals': 'overview',
}

export type SandboxSetupGuideSection = {
  id: string
  title: string
  defaultExpanded: boolean
  stepIds: readonly string[]
}

export type SandboxSetupGuideStep = {
  id: string
  title: string
  summary: string
  detail: string
  href?: string
  api?: string
  /** Spec rule number (35-45). */
  n?: number
}

export const SANDBOX_HOME_PATH = '/overview?demo=sandbox'
export const SANDBOX_CONNECTIONS_PATH = '/connections?demo=sandbox'
export const SANDBOX_CREATE_PATH = `${PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH}?demo=sandbox&upload=1`
export const SANDBOX_JOURNAL_PATH = '/payouts/intents?demo=sandbox'
export const SANDBOX_REVIEW_PATH = '/controls/review?demo=sandbox'
export const SANDBOX_CONTRACT_PATH = '/contracts/PAC-0001?demo=sandbox'
export const SANDBOX_DISPATCH_PATH = '/execution/dispatches?demo=sandbox'
export const SANDBOX_SETTLEMENT_JOURNAL_PATH = '/settlement/journal?demo=sandbox'
export const SANDBOX_OUTCOME_PATH = '/settlement/review?demo=sandbox&gap=short_settled&focus=PAY-0054'
export const SANDBOX_PROOF_PATH = '/proof/EP-0001?demo=sandbox'
export const SANDBOX_ASK_PATH = '/ask?demo=sandbox'
export const SANDBOX_BATCH_CENTER_PATH = PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH
export const SANDBOX_OUTCOME_DOCK_PATH = demoBatchHref('ambiguity')

/**
 * Spec Part 10 - three-minute guided demo (rules 35-45).
 * Populated workspace: no from-scratch configuration.
 */
export const SANDBOX_SETUP_SECTIONS: SandboxSetupGuideSection[] = [
  {
    id: 'yc-3min',
    title: '3-minute path',
    defaultExpanded: true,
    stepIds: [
      'overview',
      'connections',
      'create',
      'journal',
      'review',
      'contract',
      'dispatch',
      'settlement-journal',
      'outcome',
      'proof',
      'ask',
    ],
  },
]

export const SANDBOX_SETUP_GUIDE = {
  panelTitle: 'Guided demo path',
  title: 'Follow one payment',
  subtitle:
    'Populated demo workspace - narrative closed loop, not a page tour. Sandbox / illustrative data.',
  steps: [
    {
      id: 'overview',
      n: 35,
      title: 'Overview',
      summary: 'Lifecycle + attention queue',
      detail:
        'Show the lifecycle ribbon and attention items (blocked, short-settled, return, incomplete evidence).',
      href: SANDBOX_HOME_PATH,
    },
    {
      id: 'connections',
      n: 36,
      title: 'Connections',
      summary: 'One source · one dispatch · one outcome',
      detail: 'Show one source system, one dispatch mode, and one outcome source - honestly labelled.',
      href: SANDBOX_CONNECTIONS_PATH,
    },
    {
      id: 'create',
      n: 37,
      title: 'Create Payout',
      summary: 'Source obligation + validation preview',
      detail:
        'Open prepared samples or a single obligation. Validation before money moves - do not invent rates.',
      href: SANDBOX_CREATE_PATH,
    },
    {
      id: 'journal',
      n: 38,
      title: 'Intent Journal',
      summary: 'Open blocked beneficiary-change',
      detail: `Batch ${DEMO_SMOKE_BATCH_ID} - open PAY-0020 (beneficiary account change blocked before dispatch).`,
      href: SANDBOX_JOURNAL_PATH,
    },
    {
      id: 'review',
      n: 39,
      title: 'Control Review',
      summary: 'Authorised vs changed account',
      detail: 'Compare authorised vs changed beneficiary; show why the payout cannot move.',
      href: SANDBOX_REVIEW_PATH,
    },
    {
      id: 'contract',
      n: 40,
      title: 'Action Contract',
      summary: 'Sealed commercial boundary',
      detail: 'Open clean PAC-0001 - sealed Payment Action Contract as the lifecycle reference.',
      href: SANDBOX_CONTRACT_PATH,
    },
    {
      id: 'dispatch',
      n: 41,
      title: 'Dispatch & Trace',
      summary: 'Request · idempotency · ack · timeline',
      detail:
        'Show dispatch request, idempotency identity, provider acknowledgement, then Payment Trace timeline.',
      href: SANDBOX_DISPATCH_PATH,
    },
    {
      id: 'settlement-journal',
      n: 42,
      title: 'Settlement Journal',
      summary: 'Final downstream record',
      detail: 'Show the final settlement observation for the same payment / batch.',
      href: SANDBOX_SETTLEMENT_JOURNAL_PATH,
    },
    {
      id: 'outcome',
      n: 43,
      title: 'Outcome Review',
      summary: 'Explain the short settlement',
      detail:
        'PAY-0054 - sealed contract vs observed credit; unexplained delta. AI may explain; match stays deterministic.',
      href: SANDBOX_OUTCOME_PATH,
    },
    {
      id: 'proof',
      n: 44,
      title: 'Proof Center',
      summary: 'Verify + export complete pack',
      detail: 'EP-0001 complete P5 pack - verify and export. Also note a partial pack exists.',
      href: SANDBOX_PROOF_PATH,
    },
    {
      id: 'ask',
      n: 45,
      title: 'Ask Zord',
      summary: '/explain exception or /trace payment',
      detail:
        'Run /explain exception or /trace payment and open the cited source. AI cannot bypass policy or match.',
      href: SANDBOX_ASK_PATH,
    },
  ] satisfies SandboxSetupGuideStep[],
  notes: [
    `Workspace: ${DEMO_WORKSPACE_NAME} - Sandbox / illustrative`,
    `Primary batch: ${DEMO_SMOKE_BATCH_ID} (100 payouts: 97 exact · 1 blocked · 1 short · 1 return)`,
    'Optional cross-border: separate FX contract with external quote + net-settlement constraints',
    'Evidence: ≥1 complete P5 (EP-0001) + 1 partial pack',
    'Video rule: follow one payment closed loop - not a page tour',
    'Reviewer: no OTP / magic link; sandbox-labelled actions; no secrets or unmasked PII',
  ],
} as const

export function sandboxSetupGuideStepHref(step: SandboxSetupGuideStep): string | undefined {
  return step.href
}

export function isSandboxSetupStepDone(
  stepId: string,
  progress: SandboxSetupProgress,
): boolean {
  if (progress[stepId as keyof SandboxSetupProgress]) return true
  // Legacy marks still count toward Spec steps.
  if (stepId === 'create' && progress['intent-ingest']) return true
  if (stepId === 'settlement-journal' && progress.settlement) return true
  if (stepId === 'overview' && progress['home-signals']) return true
  return false
}

export function readSandboxSetupProgress(): SandboxSetupProgress {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SANDBOX_SETUP_PROGRESS_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SandboxSetupProgress
  } catch {
    return {}
  }
}

export function markSandboxSetupStep(stepId: keyof SandboxSetupProgress | string) {
  if (typeof window === 'undefined') return
  try {
    const canonical = PROGRESS_ALIASES[stepId] ?? (stepId as keyof SandboxSetupProgress)
    const prev = readSandboxSetupProgress()
    const next = { ...prev, [canonical]: true }
    // Keep legacy key if caller used one, so old readers still see it.
    if (stepId !== canonical) next[stepId as keyof SandboxSetupProgress] = true
    window.localStorage.setItem(SANDBOX_SETUP_PROGRESS_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('zord:sandbox-setup-progress'))
  } catch {
    /* ignore */
  }
}

export function openSandboxSetupPanel() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SANDBOX_SETUP_PANEL_DISMISSED_KEY)
    sessionStorage.removeItem(SANDBOX_SETUP_PANEL_MINIMIZED_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('zord:sandbox-setup-open'))
}
