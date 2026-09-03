import { PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH } from '../batchCommandCenterHref'
import { CROSS_BORDER_TRACE_ID } from './scenarioMode'

/** Single demo batch shown across the console after obligation upload (and settlement when present). */
export const DEMO_SMOKE_BATCH_ID = 'batch-001'
export const DEMO_BATCH_LABEL = 'Batch 001'
export const DEMO_CLIENT_BATCH_REF = 'BATCH-001'
export const DEMO_WORKSPACE_NAME = 'Zord Demo Workspace'
/** URL + session flag - prefer `sandbox`; accept legacy `yc`. */
export const DEMO_QUERY_VALUE = 'sandbox'
export const DEMO_QUERY_LEGACY = 'yc'
export const DEMO_SESSION_KEY = 'zord_demo_session'
export const DEMO_GUIDE_KEY = 'zord_demo_guide'
/** Active batch for menu deep-links across Spec routes + sandbox docks. */
export const DEMO_BATCH_STORAGE_KEY = 'zord_demo_batch'

export function isDemoQuery(value: string | null | undefined): boolean {
  return value === DEMO_QUERY_VALUE || value === DEMO_QUERY_LEGACY
}

/** Spec 7.2 Operations Overview - entry after demo login. */
export const DEMO_HOME_HREF = `/overview?demo=sandbox&batch_id=${DEMO_SMOKE_BATCH_ID}`

export function demoBatchHref(dock: string, opts?: { sandbox?: boolean; extra?: string; guide?: boolean }) {
  const base = opts?.sandbox === false ? '/payout-command-view/today' : '/sandbox'
  const q = new URLSearchParams({
    dock,
    batch_id: DEMO_SMOKE_BATCH_ID,
    client_batch_id: DEMO_SMOKE_BATCH_ID,
    demo: DEMO_QUERY_VALUE,
  })
  if (opts?.guide) q.set('guide', '1')
  if (opts?.extra) {
    for (const [k, v] of new URLSearchParams(opts.extra)) q.set(k, v)
  }
  return `${base}?${q.toString()}`
}

/**
 * Spec 7.1 guided path - same story as sandbox “Payout steps”,
 * mapped onto docks that exist today (deep-links stay populated).
 */
export const OVERVIEW_PATH_GUIDE_STEPS = [
  {
    id: 'connect',
    label: 'Connect',
    goTo: 'Connections',
    summary: 'Source systems and rails',
    detail: '',
    href: '/connections',
  },
  {
    id: 'create',
    label: 'Create',
    goTo: 'Batch Command Center',
    summary: 'Upload obligations',
    detail: '',
    href: `${PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH}?upload=1`,
  },
  {
    id: 'govern',
    label: 'Govern',
    goTo: 'Policy Studio',
    summary: 'Rules before release',
    detail: '',
    href: '/controls/policies',
  },
  {
    id: 'review',
    label: 'Review',
    goTo: 'Control Review',
    summary: 'Resolve blocked before money moves',
    detail: '',
    href: '/controls/review?demo=sandbox',
  },
  {
    id: 'seal',
    label: 'Seal',
    goTo: 'Action Contract',
    summary: 'Sealed payment action',
    detail: '',
    href: '/contracts/PAC-0001?demo=sandbox',
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    goTo: 'Dispatch & Relay',
    summary: 'Sent on approved rails',
    detail: '',
    href: '/execution/dispatches?demo=sandbox',
  },
  {
    id: 'settle',
    label: 'Settle',
    goTo: 'Settlement Journal',
    summary: 'Expected vs observed',
    detail: '',
    href: '/settlement/journal?demo=sandbox',
  },
  {
    id: 'prove',
    label: 'Prove',
    goTo: 'Proof',
    summary: 'Evidence packs',
    detail: '',
    href: '/proof?demo=sandbox',
  },
] as const

/**
 * Spec Part 10 - three-minute guided demo (rules 35-45).
 * Deep-links land on populated Spec routes (`?demo=sandbox`).
 */
export const GUIDED_DEMO_STEPS = [
  {
    n: 35,
    label: 'Overview',
    goTo: 'Rail → Overview',
    summary: 'Lifecycle + attention queue',
    href: DEMO_HOME_HREF + '&guide=1',
  },
  {
    n: 36,
    label: 'Connections',
    goTo: 'Rail → Connections',
    summary: 'One source, one dispatch, one outcome source',
    href: '/connections?demo=sandbox&guide=1',
  },
  {
    n: 37,
    label: 'Create Payout',
    goTo: 'Rail → New Payout',
    summary: 'Source obligation + validation preview',
    href: `${PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH}?demo=sandbox&guide=1&upload=1`,
  },
  {
    n: 38,
    label: 'Intent Journal',
    goTo: 'Rail → Intent',
    summary: 'Open blocked beneficiary-change (PAY-0020)',
    href: '/payouts/intents?demo=sandbox&guide=1',
  },
  {
    n: 39,
    label: 'Control Review',
    goTo: 'Rail → Control Review',
    summary: 'Authorised vs changed account - why it cannot move',
    href: '/controls/review?demo=sandbox&guide=1',
  },
  {
    n: 40,
    label: 'Action Contract',
    goTo: 'Open PAC-0001',
    summary: 'Clean payout - sealed commercial boundary',
    href: '/contracts/PAC-0001?demo=sandbox&guide=1',
  },
  {
    n: 41,
    label: 'Dispatch & Trace',
    goTo: 'Rail → Dispatch',
    summary: 'Request, idempotency, provider ack, timeline',
    href: '/execution/dispatches?demo=sandbox&guide=1',
  },
  {
    n: 42,
    label: 'Settlement Journal',
    goTo: 'Rail → Settlement',
    summary: 'Final downstream record',
    href: '/settlement/journal?demo=sandbox&guide=1',
  },
  {
    n: 43,
    label: 'Outcome Review',
    goTo: 'Rail → Outcome Review',
    summary: 'Explain short settlement (PAY-0054)',
    href: '/settlement/review?demo=sandbox&guide=1&gap=short_settled&focus=PAY-0054',
  },
  {
    n: 44,
    label: 'Proof Center',
    goTo: 'Rail → Proof',
    summary: 'Verify + export complete pack (EP-0001)',
    href: '/proof/EP-0001?demo=sandbox&guide=1',
  },
  {
    n: 45,
    label: 'Ask Zord',
    goTo: 'Rail → Ask Zord',
    summary: '/explain exception or /trace payment → open citation',
    href: '/ask?demo=sandbox&guide=1',
  },
] as const

export const GUIDED_DEMO_STEPS_CROSS_BORDER = [
  {
    n: 1,
    label: 'Action Desk',
    goTo: 'Control plane → Action Desk',
    summary: 'Proposal is NOT AUTHORIZED',
    href: '/actions/new?demo=sandbox&scenario=cross-border&guide=1',
  },
  {
    n: 2,
    label: 'Authority',
    goTo: 'Control plane → Authority',
    summary: 'Enterprise → agent → dual approval',
    href: `/actions/${CROSS_BORDER_TRACE_ID}/authority?demo=sandbox&scenario=cross-border&guide=1`,
  },
  {
    n: 3,
    label: 'Contract',
    goTo: 'Control plane → Contract',
    summary: 'Signed PAC digest',
    href: `/actions/${CROSS_BORDER_TRACE_ID}/contract?demo=sandbox&scenario=cross-border&guide=1`,
  },
  {
    n: 4,
    label: 'Dispatch',
    goTo: 'Control plane → Dispatch',
    summary: 'Gateway executes after revalidation',
    href: `/actions/${CROSS_BORDER_TRACE_ID}/dispatch?demo=sandbox&scenario=cross-border&guide=1`,
  },
  {
    n: 5,
    label: 'Agent Registry',
    goTo: 'Control plane → Agents',
    summary: 'Bound structure after dispatch',
    href: '/agents?demo=sandbox&scenario=cross-border&guide=1',
  },
  {
    n: 6,
    label: 'Signals',
    goTo: 'Control plane → Signals',
    summary: 'Duplicates and late ACK preserved',
    href: `/actions/${CROSS_BORDER_TRACE_ID}/signals?demo=sandbox&scenario=cross-border&guide=1`,
  },
  {
    n: 7,
    label: 'Lifecycle',
    goTo: 'Control plane → Lifecycle',
    summary: 'SETTLED_CONFIRMED · no regression',
    href: `/actions/${CROSS_BORDER_TRACE_ID}/lifecycle?demo=sandbox&scenario=cross-border&guide=1`,
  },
  {
    n: 8,
    label: 'Payment Gaps',
    goTo: 'Control plane → Payment Gaps',
    summary: 'Value requiring review · potential exposure',
    href: '/settlement/gaps?demo=sandbox&scenario=cross-border&guide=1',
  },
] as const

/** Resolve the batch the reviewer is currently walking - URL → session → prepared fixture. */
export function getActiveDemoBatchId(): string {
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search)
      const fromUrl = q.get('batch_id')?.trim() || q.get('client_batch_id')?.trim()
      if (fromUrl) {
        sessionStorage.setItem(DEMO_BATCH_STORAGE_KEY, fromUrl)
        return fromUrl
      }
      const stored = sessionStorage.getItem(DEMO_BATCH_STORAGE_KEY)?.trim()
      if (stored) return stored
    } catch {
      /* ignore */
    }
  }
  return DEMO_SMOKE_BATCH_ID
}

export function setActiveDemoBatchId(batchId: string) {
  const id = batchId.trim()
  if (!id || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DEMO_BATCH_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

/**
 * Keep menu destinations on the same batch (and demo session).
 * Safe for Spec routes and `/sandbox?dock=` links.
 */
export function withDemoBatchScope(href: string, batchId?: string): string {
  const [path, rawQs = ''] = href.split('?')
  const q = new URLSearchParams(rawQs)
  if (!q.has('demo')) q.set('demo', DEMO_QUERY_VALUE)
  const batch =
    batchId?.trim() ||
    (typeof window !== 'undefined' ? getActiveDemoBatchId() : DEMO_SMOKE_BATCH_ID)
  q.set('batch_id', batch)
  q.set('client_batch_id', batch)
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('zord_console_scenario')
      if (stored && !q.has('scenario')) q.set('scenario', stored)
    } catch {
      /* ignore */
    }
  }
  return `${path}?${q.toString()}`
}

export function sandboxDockHref(dock: string, batchId?: string): string {
  return withDemoBatchScope(`/sandbox?dock=${dock}`, batchId)
}

export function enterDemoSession(opts?: { guide?: boolean }) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    sessionStorage.setItem(DEMO_BATCH_STORAGE_KEY, DEMO_SMOKE_BATCH_ID)
    // Upload-first: do not pre-seed readiness. Journals / Overview stay empty until
    // obligation + settlement files are uploaded for the batch.
    if (opts?.guide) sessionStorage.setItem(DEMO_GUIDE_KEY, '1')
    else sessionStorage.removeItem(DEMO_GUIDE_KEY)
  } catch {
    /* ignore */
  }
}

export function restartDemoSession() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY)
    sessionStorage.removeItem(DEMO_GUIDE_KEY)
    sessionStorage.removeItem(DEMO_BATCH_STORAGE_KEY)
    localStorage.removeItem('zord:sandbox-setup-progress')
    sessionStorage.removeItem('zord_demo_batch_ready')
    sessionStorage.removeItem('zord_demo_batch_dispatched')
    sessionStorage.removeItem('zord_demo_batch_policy')
    try {
      window.dispatchEvent(new CustomEvent('zord:demo-batch-ready', { detail: null }))
      window.dispatchEvent(new CustomEvent('zord:demo-batch-dispatched', { detail: null }))
      window.dispatchEvent(new CustomEvent('zord:demo-batch-policy'))
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export function isDemoSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      sessionStorage.getItem(DEMO_SESSION_KEY) === '1' ||
      sessionStorage.getItem('zord_yc_demo') === '1' // legacy
    )
  } catch {
    return false
  }
}
