import {
  PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH,
} from './batchCommandCenterHref'

/** Persisted when user dismisses the Intent Journal auto-open setup dialog. */
export const SANDBOX_JOURNAL_SETUP_DISMISSED_KEY = 'zord:sandbox-intent-journal-onboarding-dismissed'

export const SANDBOX_SETUP_PANEL_DISMISSED_KEY = 'zord:sandbox-setup-panel-dismissed'
export const SANDBOX_SETUP_PANEL_MINIMIZED_KEY = 'zord:sandbox-setup-panel-minimized'
export const SANDBOX_SETUP_PROGRESS_STORAGE_KEY = 'zord:sandbox-setup-progress'

export type SandboxSetupProgress = {
  credentials?: boolean
  'intent-ingest'?: boolean
  settlement?: boolean
  journal?: boolean
  'settlement-journal'?: boolean
  'home-signals'?: boolean
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
  /** Short line shown in compact lists */
  summary: string
  /** What the console actually does today */
  detail: string
  /** Optional route or console path */
  href?: string
  /** API the step hits (console proxy → backend) */
  api?: string
}

export const SANDBOX_HOME_PATH = '/sandbox?dock=home'
export const SANDBOX_JOURNAL_PATH = '/sandbox?dock=grid'
export const SANDBOX_SETTLEMENT_JOURNAL_PATH = '/sandbox?dock=settlement'
export const SANDBOX_BATCH_CENTER_PATH = PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH

/**
 * End-to-end sandbox setup mapped to what is implemented in zord-console today.
 * Sandbox uses the same tenant-scoped prod proxies as live — no seeded demo rows.
 */
export const SANDBOX_SETUP_SECTIONS: SandboxSetupGuideSection[] = [
  {
    id: 'verify',
    title: 'Explore your workspace',
    defaultExpanded: true,
    stepIds: ['journal', 'settlement-journal', 'home-signals'],
  },
]

export const SANDBOX_SETUP_GUIDE = {
  panelTitle: 'Setup guide',
  title: 'Sandbox setup',
  subtitle:
    'After ingest, use the journals and Home command center to verify intents and settlement observations for your signed-in tenant.',
  steps: [
    {
      id: 'journal',
      title: 'Verify in Intent Journal',
      summary: 'Batches and intents from backend feeds only',
      detail:
        'Sidebar batches: GET /api/prod/intents/batches first; if empty, falls back to GET /api/prod/intelligence/batches. Selecting a batch loads intents and optional DLQ for your tenant.',
      href: SANDBOX_JOURNAL_PATH,
      api: 'GET /api/prod/intents/batches · GET /api/prod/intelligence/batches',
    },
    {
      id: 'settlement-journal',
      title: 'Verify in Settlement Journal',
      summary: 'Canonical observations per client batch',
      detail:
        'After settlement upload, observations load from GET /api/prod/settlement/observations/batches for your session tenant. Select a client batch to browse matched rows.',
      href: SANDBOX_SETTLEMENT_JOURNAL_PATH,
      api: 'GET /api/prod/settlement/observations/batches',
    },
    {
      id: 'home-signals',
      title: 'Review command center signals (optional)',
      summary: 'Home KPIs and insights from intelligence',
      detail:
        'After ingest, Home surfaces patterns, leakage, recommendations, and ambiguity from /api/prod/intelligence/* for the same tenant.',
      href: SANDBOX_HOME_PATH,
      api: 'GET /api/prod/intelligence/*',
    },
  ] satisfies SandboxSetupGuideStep[],
  notes: [
    'No demo rows in sandbox — empty journal until ingest succeeds.',
    'Connectors in sandbox are UI-only test credentials; batch ingest does not require connecting a PSP in Connectors.',
    'Switch to live via Activate when KYC is complete; until then use /payout-command-view/today.',
  ],
} as const

export function sandboxSetupGuideStepHref(step: SandboxSetupGuideStep): string | undefined {
  return step.href
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
    const prev = readSandboxSetupProgress()
    const next = { ...prev, [stepId]: true }
    window.localStorage.setItem(SANDBOX_SETUP_PROGRESS_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('zord:sandbox-setup-progress'))
  } catch {
    /* ignore */
  }
}

export function openSandboxSetupPanel() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('zord:sandbox-setup-open'))
}
