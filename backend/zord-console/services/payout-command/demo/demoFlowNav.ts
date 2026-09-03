import {
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from './scenarioMode'
import { DEMO_SMOKE_BATCH_ID, withDemoBatchScope } from './ycDemoConstants'

export type DemoFlowStep = {
  id: string
  label: string
  /** Match current pathname (prefix or exact). */
  match: (pathname: string) => boolean
  href: string
}

function cb(path: string): string {
  return withScenarioScope(withDemoBatchScope(path, DEMO_SMOKE_BATCH_ID), SCENARIO_CROSS_BORDER)
}

/** Shared steps — DemoFlowNav stamps the current scenario so India stays India. */
function batch(path: string): string {
  return withDemoBatchScope(path, DEMO_SMOKE_BATCH_ID)
}

/**
 * Cross-border demo flow — matches the end-to-end story:
 * Upload → Intent → Policy → Agent Registry → Authority → Action Desk →
 * Contract & Dispatch → Signals → Lifecycle → Settlement (bank file) →
 * Proof → Payment Gaps → Review Outcome → Proof Pack.
 */
export const CROSS_BORDER_DEMO_FLOW: DemoFlowStep[] = [
  {
    id: 'upload',
    label: 'Upload',
    match: (p) => p.includes('batch-command-center'),
    href: '/sandbox/batch-command-center?demo=sandbox&upload=1',
  },
  {
    id: 'intent',
    label: 'Intent Journal',
    match: (p) =>
      p.startsWith('/payouts/intents') ||
      (p.startsWith('/sandbox') && !p.includes('batch-command-center')),
    href: '/sandbox?dock=grid&demo=sandbox',
  },
  {
    id: 'policies',
    label: 'Policy Studio',
    match: (p) => p.startsWith('/controls/policies'),
    href: cb('/controls/policies'),
  },
  {
    id: 'agents',
    label: 'Agent Registry',
    match: (p) => p.startsWith('/agents'),
    href: cb('/agents'),
  },
  {
    id: 'authority',
    label: 'Authority',
    match: (p) => p.includes('/actions/') && p.endsWith('/authority'),
    href: cb(`/actions/${CROSS_BORDER_TRACE_ID}/authority`),
  },
  {
    id: 'action-desk',
    label: 'Action Desk',
    match: (p) => p === '/actions/new' || p.startsWith('/actions/new'),
    href: cb('/actions/new'),
  },
  {
    id: 'india-dispatch',
    label: 'Dispatch',
    match: (p) => p.startsWith('/execution/dispatches'),
    href: batch('/execution/dispatches'),
  },
  {
    id: 'contract',
    label: 'Contract & Dispatch',
    match: (p) => p.includes('/actions/') && (p.endsWith('/contract') || p.endsWith('/dispatch')),
    href: cb(`/actions/${CROSS_BORDER_TRACE_ID}/contract`),
  },
  {
    id: 'signals',
    label: 'Signals',
    match: (p) => p.includes('/actions/') && p.endsWith('/signals'),
    href: cb(`/actions/${CROSS_BORDER_TRACE_ID}/signals`),
  },
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    match: (p) =>
      (p.includes('/actions/') && p.endsWith('/lifecycle')) || p.startsWith('/payments'),
    href: cb(`/actions/${CROSS_BORDER_TRACE_ID}/lifecycle`),
  },
  {
    id: 'settlement',
    label: 'Settlement',
    match: (p) => p.startsWith('/settlement/journal'),
    href: batch('/settlement/journal'),
  },
  {
    id: 'proof',
    label: 'Proof',
    match: (p) => p.startsWith('/proof') && !p.includes('trc_'),
    href: batch('/proof'),
  },
  {
    id: 'gaps',
    label: 'Exceptions',
    match: (p) => p.startsWith('/exceptions') || p.startsWith('/settlement/gaps'),
    href: batch('/exceptions'),
  },
  {
    id: 'review',
    label: 'Review Outcome',
    match: (p) => p.startsWith('/settlement/review'),
    href: batch('/settlement/review'),
  },
  {
    id: 'proof-pack',
    label: 'Proof Pack',
    match: (p) => p.startsWith('/proof/') && (p.includes('trc_') || p.includes('pac_')),
    href: cb(`/proof/${CROSS_BORDER_TRACE_ID}`),
  },
]

export function resolveDemoFlow(pathname: string, steps: DemoFlowStep[] = CROSS_BORDER_DEMO_FLOW) {
  const index = steps.findIndex((step) => step.match(pathname))
  if (index < 0) {
    return { index: -1, current: null, prev: null, next: null, steps }
  }
  return {
    index,
    current: steps[index]!,
    prev: index > 0 ? steps[index - 1]! : null,
    next: index < steps.length - 1 ? steps[index + 1]! : null,
    steps,
  }
}
