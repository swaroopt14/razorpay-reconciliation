import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  AlertCircle,
  FileText,
  GitBranch,
  BarChart3,
  MessageSquare,
  Search,
  Settings,
} from 'lucide-react'

export interface KeyArea {
  id: string
  title: string
  desc: string
  icon: LucideIcon
  href: string
  highlight?: boolean
}

export const KEY_AREAS: KeyArea[] = [
  {
    id: 'intent-journal',
    title: 'Intent Journal',
    desc: 'See status, details, timeline, and evidence for every intent. Filter by status, date, or search by ID.',
    icon: BookOpen,
    href: '/intent-journal',
    highlight: true,
  },
  {
    id: 'dlq',
    title: 'Dead Letter Queue',
    desc: 'Failed intents that need attention. View error details, reason codes, and retry or fix before replay.',
    icon: AlertCircle,
    href: '/dlq',
  },
  {
    id: 'schema',
    title: 'Schema & Contracts',
    desc: 'Define and version your payment schemas. Add fields, invariants, and validate incoming payloads.',
    icon: FileText,
    href: '/schema',
  },
  {
    id: 'replay',
    title: 'Replay & Evidence',
    desc: 'Investigate intent lifecycles. View evidence packs, compare versions, and replay with different schemas.',
    icon: GitBranch,
    href: '/replay',
  },
  {
    id: 'timeline',
    title: 'Event Graph Timeline',
    desc: 'Visual timeline of events across lanes. See confidence over time, dependencies, and bottlenecks.',
    icon: BarChart3,
    href: '/timeline',
  },
  {
    id: 'copilot',
    title: 'AI Copilot',
    desc: 'Ask questions about intents, schema, failures. Get summaries, debugging help, and step-by-step guidance.',
    icon: MessageSquare,
    href: '/copilot',
  },
  {
    id: 'logs',
    title: 'API Logs & Callbacks',
    desc: 'Monitor API calls, webhooks, and callback delivery. Debug integration issues and track latency.',
    icon: Search,
    href: '/logs',
  },
  {
    id: 'settings',
    title: 'Settings & Audit',
    desc: 'Configure webhooks, API keys, team access. View audit logs and compliance reports.',
    icon: Settings,
    href: '/team',
  },
]
