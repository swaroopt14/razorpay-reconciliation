'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { FinalLandingNavbar } from '@/components/landing-final/FinalLandingNavbar'
import { PAYOUT_COMMAND_HOLY_GRAIL as H } from '@/components/landing-final/copy/landingHolyGrailCopy'
import { buyerPersonas, landingPricingCopy } from '@/components/landing-final/copy/landingPagesCopy'
import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { ZordLogo } from '@/components/ZordLogo'

type GlyphName =
  | 'arrow-right'
  | 'arrow-up-right'
  | 'chat'
  | 'chevron-down'
  | 'document'
  | 'menu-dots'
  | 'search'
  | 'play'
  | 'users'
  | 'bank'
  | 'folder'
  | 'home'
  | 'shield'
  | 'chart'
  | 'layers'
  | 'wallet'
  | 'globe'
  | 'refresh'
  | 'check-circle'
  | 'book'
  | 'grid'
  | 'eye'
  | 'zap'

function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  const base = `inline-block ${className}`

  switch (name) {
    case 'arrow-right':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="m10.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'arrow-up-right':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'chat':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M5.2 4.5h9.6a2.7 2.7 0 0 1 2.7 2.7v5.6a2.7 2.7 0 0 1-2.7 2.7H9.7l-3.3 2.2c-.34.23-.8-.02-.8-.44V15.5H5.2a2.7 2.7 0 0 1-2.7-2.7V7.2a2.7 2.7 0 0 1 2.7-2.7Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" /><path d="M7.1 9.8h.01M10 9.8h.01M12.9 9.8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    case 'chevron-down':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'document':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6 3.8h5.8L15 7v9.2A1.8 1.8 0 0 1 13.2 18H6.8A1.8 1.8 0 0 1 5 16.2V5.6A1.8 1.8 0 0 1 6.8 3.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M11.8 3.8V7H15M7.8 10.2h4.8M7.8 13h4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'menu-dots':
      return <svg className={base} viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="15" cy="10" r="1.6" /></svg>
    case 'search':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.8" stroke="currentColor" strokeWidth="1.7" /><path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    case 'play':
      return <svg className={base} viewBox="0 0 20 20" fill="currentColor"><path d="m7 5 8 5-8 5V5Z" /></svg>
    case 'users':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6.2 9.3a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM13.8 8.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="1.5" /><path d="M2.8 15.8c.3-2.5 2.4-4.3 5.1-4.3s4.8 1.8 5.1 4.3M11.4 15.8c.2-1.9 1.8-3.2 3.9-3.2 1 0 2 .3 2.7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    case 'bank':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M3 7.2 10 3l7 4.2M4.5 8.5v6.8M8 8.5v6.8M12 8.5v6.8M15.5 8.5v6.8M2.5 16.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'folder':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M3.5 6.2A2.2 2.2 0 0 1 5.7 4h2l1.6 1.6h5a2.2 2.2 0 0 1 2.2 2.2v6.5a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V6.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
    case 'home':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4.5 8.3 10 4l5.5 4.3v7.2H11.8v-4H8.2v4H4.5V8.3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>
    case 'shield':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M10 2.5 4.5 4.8v4.5c0 4 2.3 6.3 5.5 8.2 3.2-1.9 5.5-4.2 5.5-8.2V4.8L10 2.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="m7.3 10.1 1.8 1.8 3.6-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'chart':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 14.5V9.5M10 14.5V5.5M16 14.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 16.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    case 'layers':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="m10 3 7 3.8-7 3.7L3 6.8 10 3ZM3 10.7l7 3.8 7-3.8M3 14.7l7 3.3 7-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'wallet':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 6.2A2.2 2.2 0 0 1 6.2 4H14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.2A2.2 2.2 0 0 1 4 13.8V6.2Z" stroke="currentColor" strokeWidth="1.5" /><path d="M12.8 10h3.2v2.7h-3.2A1.35 1.35 0 0 1 11.4 11.35v0A1.35 1.35 0 0 1 12.8 10Z" stroke="currentColor" strokeWidth="1.5" /></svg>
    case 'globe':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="M3.5 10h13M10 3c1.8 2 2.7 4.2 2.7 7S11.8 15 10 17M10 3C8.2 5 7.3 7.2 7.3 10s.9 5 2.7 7" stroke="currentColor" strokeWidth="1.5" /></svg>
    case 'refresh':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M16 6.5V3.8l-2.6 2.3A6.2 6.2 0 1 0 16 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'check-circle':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" /><path d="m6.8 10.3 2.2 2.2 4.2-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'book':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 4.5h8.5a2.5 2.5 0 0 1 2.5 2.5v8.5H6.5A2.5 2.5 0 0 0 4 18V4.5Z" stroke="currentColor" strokeWidth="1.5" /><path d="M15 15.5H6.5A2.5 2.5 0 0 0 4 18" stroke="currentColor" strokeWidth="1.5" /></svg>
    case 'grid':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="12" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="3" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="12" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /></svg>
    case 'eye':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="10" r="2.4" fill="currentColor" /></svg>
    case 'zap':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M10.7 2.8 5.8 10h3l-.5 7.2 5-7.3h-3l.4-7.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    default:
      return null
  }
}

const heroSlideVisuals = {
  control: {
    image: '/final-landing/hero/control-layer.png',
    imageAlt: 'Cross-functional payout operator monitoring the control layer from mobile and desktop surfaces',
    imageClassName: 'object-cover object-[62%_center]',
    panelWidthClassName: 'w-[38%] max-w-[244px]',
  },
  marketplace: {
    image: '/final-landing/hero/icp-marketplaces.png',
    imageAlt: 'Marketplace payout operators reviewing seller exceptions and payout batches together',
    imageClassName: 'object-cover object-[66%_center]',
    panelWidthClassName: 'w-[36%] max-w-[232px]',
  },
  nbfc: {
    image: '/final-landing/hero/icp-nbfc-lenders.png',
    imageAlt: 'NBFC leader reviewing disbursal audit, compliance, and bank confirmation posture',
    imageClassName: 'object-cover object-[63%_center]',
    panelWidthClassName: 'w-[38%] max-w-[244px]',
  },
  psp: {
    image: '/final-landing/hero/icp-fintech-psps.png',
    imageAlt: 'Payment service provider team reviewing connector performance, payout health, and confirmation posture',
    imageClassName: 'object-cover object-center',
    panelWidthClassName: 'w-[36%] max-w-[232px]',
  },
} as const

const heroSlides = landingHomeCopy.hero.slides.map((slide) => ({
  ...slide,
  ...heroSlideVisuals[slide.id],
}))

const heroBaseActions = landingHomeCopy.hero.exploreActions

const problemStacks = [
  {
    team: 'Ops',
    view: 'Sees provider status but not the bank-side truth.',
    icon: 'refresh' as GlyphName,
  },
  {
    team: 'Finance',
    view: 'Sees settlement and exceptions after the fact.',
    icon: 'wallet' as GlyphName,
  },
  {
    team: 'Engineering',
    view: 'Sees technical logs and retries without close-ready context.',
    icon: 'grid' as GlyphName,
  },
] as const

const solutionPoints = [
  {
    title: 'Provider + bank visibility',
    description: 'Track provider ack, rail behavior, and bank confirmation in one sequence.',
    icon: 'bank' as GlyphName,
  },
  {
    title: 'Catch confirmation drift early',
    description: 'Spot SLA pressure, pending finality, and statement lag before they turn into escalations.',
    icon: 'chart' as GlyphName,
  },
  {
    title: 'Export Evidence Packs fast',
    description: 'Hand finance and audit a defensible payout timeline without hunting across systems.',
    icon: 'book' as GlyphName,
  },
] as const

const switchboardViews = [
  { id: 'psp', label: 'Connector status' },
  { id: 'rails', label: 'Payment rails' },
  { id: 'provider', label: 'Connector performance' },
  { id: 'banks', label: 'Bank exposure' },
] as const

const dashboardDockItems = [
  {
    id: 'home',
    icon: 'home' as GlyphName,
    label: 'Home',
    surfaceMode: 'analytics' as const,
    heading: 'Home overview',
    breadcrumb: 'Home',
    summary: 'A guided entry point into live payout posture, movement, and Proof Readiness.',
    defaultView: 'psp' as (typeof switchboardViews)[number]['id'],
    promptPlaceholder: 'Ask about the overall payout picture, recovery posture, or where to look first',
    promptIntro: 'How can I help with today’s payout overview?',
    promptTabs: ['Today', 'Overview', 'Risk', 'Close'],
    promptSuggestions: [
      'Show me the top payout risk right now',
      'What changed since the last refresh?',
      'Where should ops start this review?',
    ],
    promptTiles: [
      { icon: 'home' as GlyphName, title: 'Workspace summary', body: 'Start with the highest-signal operating summary across routes, banks, and proofs.' },
      { icon: 'chart' as GlyphName, title: 'Trend readout', body: 'Explain the biggest movement in payout value and exception pressure this cycle.' },
      { icon: 'eye' as GlyphName, title: 'Risk scan', body: 'Highlight what deserves attention before it turns into support or finance load.' },
      { icon: 'book' as GlyphName, title: 'Close readiness', body: 'Check whether proof, reconciliation, and audit packets are ready to move.' },
    ],
  },
  {
    id: 'workspace',
    icon: 'folder' as GlyphName,
    label: 'Workspace',
    surfaceMode: 'prompt' as const,
    heading: H.paymentOperationsView.title,
    breadcrumb: 'Overview',
    summary: H.paymentOperationsView.subtitle,
    defaultView: 'psp' as (typeof switchboardViews)[number]['id'],
    promptPlaceholder: 'Ask about payment gaps, missing references, proof readiness, and review items',
    promptIntro: 'What should Zord check in this payment data?',
    promptTabs: ['Today', 'Connectors', 'Evidence', 'Banks'],
    promptSuggestions: [
      'Show where payment value is concentrating right now',
      'Clarify which issue belongs to bank-side operations',
      'What is delaying Evidence Pack export today?',
    ],
    promptTiles: [
      { icon: 'folder' as GlyphName, title: 'Payout workspace', body: 'Read processed payment value, live exceptions, and finance evidence from one operating surface.' },
      { icon: 'users' as GlyphName, title: 'Ownership handoff', body: 'Clarify whether the next move belongs to ops, finance, engineering, or bank-side follow-up.' },
      { icon: 'bank' as GlyphName, title: 'Bank coordination', body: 'Surface confirmation delays and bank-side drift before they block clean settlement.' },
      { icon: 'shield' as GlyphName, title: 'Connector guardrail', body: 'Keep connector posture visible while volume shifts around underperforming partners.' },
    ],
  },
  {
    id: 'proof',
    icon: 'document' as GlyphName,
    label: 'Proof',
    surfaceMode: 'prompt' as const,
    heading: H.evidence.pageTitle,
    breadcrumb: 'Evidence',
    summary: 'Build, verify, and export proof for payments, settlements, disputes, and audit review.',
    defaultView: 'provider' as (typeof switchboardViews)[number]['id'],
    promptPlaceholder: 'Ask which Evidence Packs are ready, what evidence is missing, or what finance can close now',
    promptIntro: 'What evidence packs are ready for finance or audit?',
    promptTabs: ['Today', 'Evidence', 'Audit', 'Close'],
    promptSuggestions: [
      'Which Evidence Packs are ready now?',
      'What evidence is still missing?',
      'Can finance close this cycle today?',
    ],
    promptTiles: [
      { icon: 'document' as GlyphName, title: H.evidence.exportAction, body: 'Download evidence summary for the selected period.' },
      { icon: 'book' as GlyphName, title: 'Audit defense', body: 'See which payout timelines are fully defensible for audit and review.' },
      { icon: 'grid' as GlyphName, title: 'Evidence map', body: 'Follow how confirmations, bank signals, and statements assemble into one Evidence Pack.' },
      { icon: 'check-circle' as GlyphName, title: 'Close signal', body: 'Separate ready-to-close intents from the set still waiting on supporting proof.' },
    ],
  },
  {
    id: 'grid',
    icon: 'grid' as GlyphName,
    label: 'Grid',
    surfaceMode: 'prompt' as const,
    heading: 'Operations grid',
    breadcrumb: 'Grid',
    summary: 'A cross-functional command grid for support, finance, and engineering handoff.',
    defaultView: 'provider' as (typeof switchboardViews)[number]['id'],
    promptPlaceholder: 'Ask how work should be split across teams, what the hot path is, or where handoff is blocked',
    promptIntro: 'How can I help with the operations grid?',
    promptTabs: ['Today', 'Support', 'Finance', 'Engineering'],
    promptSuggestions: [
      'What should support handle first?',
      'Where does finance need a handoff?',
      'Which issues still need engineering?',
    ],
    promptTiles: [
      { icon: 'grid' as GlyphName, title: 'Operations map', body: 'See the work grid spanning support, finance, provider ops, and engineering.' },
      { icon: 'users' as GlyphName, title: 'Shared queue', body: 'Expose where multiple teams are touching the same payout state today.' },
      { icon: 'eye' as GlyphName, title: 'Handoff watch', body: 'Spot the exact queue where ownership is unclear or response is slowing.' },
      { icon: 'arrow-right' as GlyphName, title: 'Next action', body: 'Turn the current payout posture into a clear next move for the right team.' },
    ],
  },
  {
    id: 'banks',
    icon: 'bank' as GlyphName,
    label: 'Banks',
    surfaceMode: 'analytics' as const,
    heading: 'Bank exception view',
    breadcrumb: 'Banks',
    summary: 'Focus bank-side lag, confirmation timing drift, and hotspot concentration inside the active queue.',
    defaultView: 'banks' as (typeof switchboardViews)[number]['id'],
    promptPlaceholder: 'Ask which bank cluster is slowing confirmation, where delays are building, or where escalation should start',
    promptIntro: 'How can I help with bank exceptions today?',
    promptTabs: ['Today', 'Banks', 'Confirmations', 'Escalations'],
    promptSuggestions: [
      'Which bank cluster is the hotspot?',
      'What is causing confirmation delay?',
      'Where should bank escalation start?',
    ],
    promptTiles: [
      { icon: 'bank' as GlyphName, title: 'Bank hotspots', body: 'Pinpoint which bank clusters are adding delay into the live exception set.' },
      { icon: 'refresh' as GlyphName, title: 'Confirmation timing', body: 'See how bank confirmation timing shifts across banks, rails, and review windows.' },
      { icon: 'shield' as GlyphName, title: 'Escalation path', body: 'Open the cleanest escalation path when bank-side behavior starts drifting.' },
      { icon: 'chart' as GlyphName, title: 'Concentration view', body: 'Track how much failure share is concentrated in the top bank-side hotspots.' },
    ],
  },
  {
    id: 'sync',
    icon: 'refresh' as GlyphName,
    label: 'Refresh',
    surfaceMode: 'prompt' as const,
    heading: 'Live sync board',
    breadcrumb: 'Refresh',
    summary: 'Watch sync cycles, refresh actions, and changing exception posture in real time.',
    defaultView: 'rails' as (typeof switchboardViews)[number]['id'],
    promptPlaceholder: 'Ask what changed on the last sync, which metrics moved, or whether the board is still current',
    promptIntro: 'How can I help with the live sync board?',
    promptTabs: ['Today', 'Sync', 'Delta', 'Freshness'],
    promptSuggestions: [
      'What changed in the last sync?',
      'Which metric moved the most?',
      'Is this dashboard still current?',
    ],
    promptTiles: [
      { icon: 'refresh' as GlyphName, title: 'Live sync', body: 'Track what changed on the latest refresh across payout movement and exception state.' },
      { icon: 'chart' as GlyphName, title: 'Delta monitor', body: 'See which metrics moved most since the previous dashboard cycle.' },
      { icon: 'globe' as GlyphName, title: 'Surface freshness', body: 'Check whether this workspace still reflects the newest payout state and evidence.' },
      { icon: 'zap' as GlyphName, title: 'Instant actions', body: 'Pair refresh cycles with next-best actions when posture starts drifting fast.' },
    ],
  },
] as const

const switchboardPspStatus = [
  { name: 'Razorpay', state: 'HEALTHY', metric: '1.9% errors · 210ms', tone: 'healthy' },
  { name: 'Cashfree', state: 'DEGRADED', metric: '5.6% errors · 340ms', tone: 'warn' },
  { name: 'PayU', state: 'CRITICAL', metric: '12.4% errors · 4.2s', tone: 'critical' },
  { name: 'Stripe', state: 'HEALTHY', metric: '1.1% errors · 180ms', tone: 'healthy' },
  { name: 'Bank API', state: 'UNKNOWN', metric: 'No signal in 3m', tone: 'info' },
] as const

const switchboardRailStatus = [
  {
    rail: 'IMPS',
    status: 'Stable',
    note: 'Primary lane healthy across Razorpay and Stripe for high-priority traffic.',
    tone: 'healthy',
  },
  {
    rail: 'NEFT',
    status: 'Batch watch',
    note: 'Cashfree confirmations are stable, but settlement windows are stretching past expected batch close.',
    tone: 'warn',
  },
  {
    rail: 'RTGS',
    status: 'Protected',
    note: 'High-value traffic remains controlled, though response time is slightly elevated.',
    tone: 'info',
  },
] as const

const switchboardProviderRows = [
  { provider: 'Razorpay', route: 'Primary IMPS', success: '99.1%', latency: '210ms', webhook: '99.6%', severity: 'Low', tone: 'healthy' },
  { provider: 'Cashfree', route: 'NEFT / UPI support', success: '98.4%', latency: '340ms', webhook: '98.8%', severity: 'Medium', tone: 'warn' },
  { provider: 'PayU', route: 'Overflow / weekend only', success: '91.6%', latency: '4.2s', webhook: '93.2%', severity: 'Critical', tone: 'critical' },
  { provider: 'Stripe', route: 'High-value RTGS', success: '99.3%', latency: '180ms', webhook: '99.5%', severity: 'Low', tone: 'healthy' },
] as const

const switchboardBankRows = [
  { bank: 'ICICI', failed: '84 failed', concentration: '2.7%', trend: 'Weekend IMPS cluster is still active.', tone: 'critical' },
  { bank: 'SBI', failed: '41 failed', concentration: '1.4%', trend: 'Statement lag is building on NEFT batch.', tone: 'warn' },
  { bank: 'Axis', failed: '12 failed', concentration: '0.5%', trend: 'Recovered after the morning slowdown.', tone: 'healthy' },
] as const

const switchboardLensDashboard = {
  psp: {
    title: 'Processed volume',
    metric: 'Preview',
    summary: 'Illustrative view of intended vs bank-confirmed value and connector performance in the workspace.',
    beforeLabel: 'Before review',
    afterLabel: 'After matching',
    beforeColor: '#d6b1dc',
    afterColor: '#13161d',
    points: [
      { label: '1 Jan', before: 3, after: 0 },
      { label: '8 Jan', before: 5, after: 0 },
      { label: '15 Jan', before: 4, after: 1 },
      { label: '22 Jan', before: 3, after: 6 },
      { label: '29 Jan', before: 2, after: 8 },
    ],
    listTitle: 'Provider queue watch',
    listItems: [
      { label: switchboardPspStatus[0].name, value: 'Stable', note: switchboardPspStatus[0].metric, tone: switchboardPspStatus[0].tone },
      { label: switchboardPspStatus[1].name, value: 'Watch', note: switchboardPspStatus[1].metric, tone: switchboardPspStatus[1].tone },
      { label: switchboardPspStatus[2].name, value: 'Review', note: switchboardPspStatus[2].metric, tone: switchboardPspStatus[2].tone },
    ],
    listFooter: '+2 more providers',
    listAction: 'View all',
    statTitle: 'Matching confidence',
    statValue: 'Preview',
    statUnit: 'illustrative',
    statChange: 'Sample',
    statNote: 'Sandbox workspace preview — not production metrics.',
    statBars: [8, 10, 9, 11, 13, 14, 12, 13, 15, 16, 17, 18, 16, 15, 17, 18, 20, 19, 21, 20, 22, 24],
    splitTitle: 'Issue ownership',
    splits: [
      ['32%', 'provider-side'],
      ['68%', 'bank-side'],
    ],
    prompt: 'Summarize connector performance and unconfirmed exposure for this batch.',
    responses: [
      'PayU shows elevated errors in this preview — finance should review unmatched settlements before close.',
      'Cashfree and Razorpay remain stable in the illustrative connector grid.',
      'Evidence Packs are available for export when matching and settlement data are connected.',
    ],
    chips: ['PayU needs review', 'Cashfree stable', 'Evidence Packs preview'],
  },
  rails: {
    title: 'Rail posture',
    metric: 'Preview',
    summary: 'Illustrative view of rail status, batch timing, and bank-side delays in the workspace preview.',
    beforeLabel: 'Scheduled batch',
    afterLabel: 'Observed lane',
    beforeColor: '#b9bed2',
    afterColor: '#13161d',
    points: [
      { label: '1 Jan', before: 4, after: 1 },
      { label: '8 Jan', before: 5, after: 2 },
      { label: '15 Jan', before: 6, after: 2 },
      { label: '22 Jan', before: 5, after: 4 },
      { label: '29 Jan', before: 4, after: 5 },
    ],
    listTitle: 'Rail posture',
    listItems: [
      { label: switchboardRailStatus[0].rail, value: switchboardRailStatus[0].status, note: switchboardRailStatus[0].note, tone: switchboardRailStatus[0].tone },
      { label: switchboardRailStatus[1].rail, value: switchboardRailStatus[1].status, note: switchboardRailStatus[1].note, tone: switchboardRailStatus[1].tone },
      { label: switchboardRailStatus[2].rail, value: switchboardRailStatus[2].status, note: switchboardRailStatus[2].note, tone: switchboardRailStatus[2].tone },
    ],
    listFooter: 'Product preview',
    listAction: 'Open rail view',
    statTitle: 'Batch watch',
    statValue: 'Preview',
    statUnit: 'illustrative',
    statChange: 'Sample',
    statNote: 'Sandbox workspace preview — not production metrics.',
    statBars: [6, 7, 8, 8, 10, 12, 11, 13, 14, 13, 15, 16, 17, 17, 18, 19, 18, 20, 21, 22, 22, 23],
    splitTitle: 'Lane mix',
    splits: [
      ['IMPS', 'primary lane'],
      ['NEFT + RTGS', 'batch lanes'],
    ],
    prompt: 'Which rail needs attention before the afternoon batch closes?',
    responses: [
      'NEFT still needs active watch because confirmation windows are stretching past expected batch close.',
      'IMPS remains the cleanest lane for priority traffic, while RTGS is protected but slightly elevated on response time.',
      'Focus follow-up on NEFT batch timing and Evidence Pack exports for delayed confirmations.',
    ],
    chips: ['NEFT batch watch', 'RTGS protected', 'IMPS stable'],
  },
  provider: {
    title: 'Connector performance',
    metric: 'Preview',
    summary: 'Illustrative connector health, confirmation trust, and leakage signals from the workspace preview.',
    beforeLabel: 'Before review',
    afterLabel: 'After review',
    beforeColor: '#c4c8d8',
    afterColor: '#13161d',
    points: [
      { label: '1 Jan', before: 2, after: 4 },
      { label: '8 Jan', before: 3, after: 5 },
      { label: '15 Jan', before: 4, after: 6 },
      { label: '22 Jan', before: 3, after: 7 },
      { label: '29 Jan', before: 2, after: 8 },
    ],
    listTitle: 'Connector health table',
    listItems: [
      { label: switchboardProviderRows[0].provider, value: switchboardProviderRows[0].severity, note: switchboardProviderRows[0].route, tone: switchboardProviderRows[0].tone },
      { label: switchboardProviderRows[1].provider, value: switchboardProviderRows[1].severity, note: switchboardProviderRows[1].route, tone: switchboardProviderRows[1].tone },
      { label: switchboardProviderRows[2].provider, value: switchboardProviderRows[2].severity, note: switchboardProviderRows[2].route, tone: switchboardProviderRows[2].tone },
    ],
    listFooter: 'Product preview',
    listAction: 'View table',
    statTitle: 'Confirmation trust',
    statValue: 'Preview',
    statUnit: 'illustrative',
    statChange: 'Sample',
    statNote: 'Sandbox workspace preview — not production metrics.',
    statBars: [7, 8, 10, 11, 11, 12, 13, 13, 14, 15, 16, 17, 17, 18, 18, 19, 20, 20, 21, 22, 21, 23],
    splitTitle: 'Connector mix',
    splits: [
      ['Razorpay', 'primary'],
      ['Other lanes', 'overflow'],
    ],
    prompt: 'Which connector still needs review in this batch?',
    responses: [
      'PayU remains the highest-risk connector in this preview because failures and slow responses are elevated.',
      'Razorpay and Stripe are stable enough for priority traffic, while Cashfree can support overflow.',
      'Keep confirmation monitoring elevated and review PayU exposure before finance close.',
    ],
    chips: ['PayU needs review', 'Razorpay stable', 'Evidence Packs preview'],
  },
  banks: {
    title: 'Bank exposure',
    metric: 'Preview',
    summary: 'Illustrative bank-side delays, statement lag, and confirmation clusters in the workspace preview.',
    beforeLabel: 'Statement lag',
    afterLabel: 'Recovered confirmations',
    beforeColor: '#cab9d9',
    afterColor: '#13161d',
    points: [
      { label: '1 Jan', before: 4, after: 1 },
      { label: '8 Jan', before: 5, after: 2 },
      { label: '15 Jan', before: 6, after: 2 },
      { label: '22 Jan', before: 7, after: 3 },
      { label: '29 Jan', before: 8, after: 4 },
    ],
    listTitle: 'Bank exposure',
    listItems: [
      { label: switchboardBankRows[0].bank, value: switchboardBankRows[0].failed, note: switchboardBankRows[0].trend, tone: switchboardBankRows[0].tone },
      { label: switchboardBankRows[1].bank, value: switchboardBankRows[1].failed, note: switchboardBankRows[1].trend, tone: switchboardBankRows[1].tone },
      { label: switchboardBankRows[2].bank, value: switchboardBankRows[2].failed, note: switchboardBankRows[2].trend, tone: switchboardBankRows[2].tone },
    ],
    listFooter: 'Product preview',
    listAction: 'Open bank view',
    statTitle: 'Hotspot watch',
    statValue: 'Preview',
    statUnit: 'illustrative',
    statChange: 'Sample',
    statNote: 'Sandbox workspace preview — not production metrics.',
    statBars: [5, 6, 7, 8, 8, 9, 10, 11, 11, 12, 13, 14, 13, 14, 15, 16, 17, 18, 19, 18, 20, 21],
    splitTitle: 'Pending source',
    splits: [
      ['Bank-side delay', 'primary'],
      ['Provider retry', 'secondary'],
    ],
    prompt: 'What is driving the current bank-side exception spike?',
    responses: [
      'ICICI still accounts for the largest active cluster, while SBI is adding NEFT statement lag into the same exception set.',
      'Most pending confirmations are bank-side rather than provider-side in this preview.',
      'Focus next action on bank escalation and Evidence Pack packaging for delayed intents.',
    ],
    chips: ['ICICI hotspot', 'SBI lag building', 'Bank-side review'],
  },
} as const

type PricingFamily = {
  id: string
  label: string
  eyebrow: string
  kicker: string
  metric: string
  detail: string
  subdetail: string
  highlights: readonly string[]
  stats: readonly (readonly [string, string])[]
  footnote?: string
}

type PricingPlan = {
  title: string
  subtitle: string
  metric: string
  detail: string
  points: readonly string[]
  ctaLabel: string
  href: string
  featured?: boolean
  badge?: string
}

const pricingFamilies: readonly PricingFamily[] = [
  {
    id: landingPricingCopy.product.id,
    label: landingPricingCopy.product.label,
    eyebrow: landingPricingCopy.product.eyebrow,
    kicker: landingPricingCopy.product.kicker,
    metric: landingPricingCopy.product.metric,
    detail: landingPricingCopy.product.detail,
    subdetail: landingPricingCopy.product.subdetail,
    highlights: landingPricingCopy.product.highlights,
    stats: landingPricingCopy.product.stats,
  },
] as const

const pricingPlans: readonly PricingPlan[] = [
  {
    title: landingPricingCopy.plans[0].title,
    subtitle: landingPricingCopy.plans[0].subtitle,
    metric: landingPricingCopy.plans[0].metric,
    detail: landingPricingCopy.plans[0].detail,
    points: landingPricingCopy.plans[0].points,
    ctaLabel: 'Start in sandbox',
    href: '/signin',
  },
  {
    title: landingPricingCopy.plans[1].title,
    subtitle: landingPricingCopy.plans[1].subtitle,
    metric: landingPricingCopy.plans[1].metric,
    detail: landingPricingCopy.plans[1].detail,
    points: landingPricingCopy.plans[1].points,
    featured: true,
    badge: 'Most popular',
    ctaLabel: 'Talk to sales',
    href: 'mailto:Support@zordnet.com?subject=Growth%20plan%20for%20ZORD',
  },
  {
    title: landingPricingCopy.plans[2].title,
    subtitle: landingPricingCopy.plans[2].subtitle,
    metric: landingPricingCopy.plans[2].metric,
    detail: landingPricingCopy.plans[2].detail,
    points: landingPricingCopy.plans[2].points,
    ctaLabel: 'Contact sales',
    href: 'mailto:Support@zordnet.com?subject=Custom%20pricing%20for%20ZORD',
  },
] as const

const pricingFaqs = landingPricingCopy.faqs

const capabilityBuckets = landingHomeCopy.capabilities

const orchestrationStages = landingHomeCopy.howItWorks.stages

const resultsShowcaseStats = landingHomeCopy.infrastructure.stats

/** Retired scale-stats section — kept empty so exported MetricsSection stays honest if mounted elsewhere. */
const impactStats: Array<{ value: string; label: string }> = []

const whyAdoptCards = [
  {
    title: 'Prevent failures early',
    description: 'Teams review connector drift sooner because provider quality, bank exposure, and confirmation gaps show up in one workspace.',
  },
  {
    title: 'Track everything in one place',
    description: 'Ops, finance, and engineering no longer work from different payout truths and delayed handoffs.',
  },
  {
    title: 'Close faster with proof',
    description: 'Evidence is export-ready when finance needs answers, month-end clarity, or audit defense.',
  },
] as const

const commandTiles = [
  { label: 'Payment instructions', value: 'Sample batch', change: 'Intent Journal', accent: 'sky' },
  { label: 'Fully Matched Value', value: 'Illustrative', change: 'Match Confidence', accent: 'blue' },
  { label: 'Evidence Packs', value: 'Preview', change: 'dispute-ready', accent: 'indigo' },
  { label: 'Unconfirmed exposure', value: 'Sample', change: 'value at risk', accent: 'slate' },
  { label: 'Connector watch', value: 'PSP view', change: 'performance', accent: 'cyan' },
  { label: 'Recommended actions', value: 'Preview', change: 'finance ops', accent: 'sky' },
] as const

const operatingStories = buyerPersonas

const resourceCards = [
  {
    eyebrow: 'Product walkthrough',
    title: 'See how ZORD operates across confirmation, matching, and proof',
    body: 'Start with the operating model if your team needs the fastest explanation of how ZORD works in production.',
    href: '/final-landing/how-it-works',
    cta: 'Open how it works',
  },
  {
    eyebrow: 'Security and trust',
    title: 'Review controls, bank-side visibility, and finance-ready evidence',
    body: 'Use this path when security, proof, auditability, and operational trust matter before rollout.',
    href: '#security',
    cta: 'Review security',
  },
  {
    eyebrow: 'Pricing and rollout',
    title: 'Understand plan structure, buying motion, and implementation fit',
    body: 'See pricing logic, rollout paths, and when teams move from pilot to deeper operational adoption.',
    href: '#pricing',
    cta: 'View pricing',
  },
  {
    eyebrow: 'Talk to the team',
    title: 'Get product access, technical answers, or onboarding support',
    body: 'Reach Arealis directly for demos, integration questions, enterprise rollout discussions, or support.',
    href: 'mailto:Support@zordnet.com?subject=ZORD%20resources%20and%20support',
    cta: 'Contact Arealis',
  },
] as const

const arealisMilestones = [
  {
    title: 'Google Agentic AI Hackathon 2025',
    detail:
      'Recognized among 53,000+ teams for an agentic AI system capable of orchestrating autonomous decision flows at city scale.',
  },
  {
    title: 'IIT Bombay National Showcase',
    detail:
      'Selected as one of India’s standout deep-tech innovations for applied AI and enterprise intelligence systems.',
  },
  {
    title: 'Wadhwani Foundation Liftoff Program',
    detail:
      'Chosen as a high-potential AI startup building enterprise-grade intelligence infrastructure with real operating depth.',
  },
] as const

const arealisTeam = [
  {
    name: 'Abhishek J. Shirsath',
    role: 'Founder & CEO',
    summary:
      'Leads the Arealis vision for intelligence that does not just analyze systems, but acts inside them with resilience and explainability.',
  },
  {
    name: 'Sahil Kirad',
    role: 'Fullstack and Backend Developer',
    summary:
      'Builds the product and backend foundations that let ZORD and other Arealis systems scale cleanly in production.',
  },
  {
    name: 'Yashwanth Reddy',
    role: 'Cloud DevOps Engineer',
    summary:
      'Designs secure, scalable cloud infrastructure for enterprise AI operations and resilient platform delivery.',
  },
  {
    name: 'Swaroop Thakare',
    role: 'AI & Development Engineer',
    summary:
      'Focuses on system logic, intelligent automation, and the product experience across distributed agent-led workflows.',
  },
  {
    name: 'Prathamesh Bhamare',
    role: 'Machine Learning Engineer',
    summary:
      'Develops the models and applied intelligence systems that power decision-making across the Arealis platform.',
  },
] as const

const featureCards = [
  {
    title: 'Review connector posture before failure spikes spread',
    desc: 'Watch provider quality and rail posture in one command layer so ops can intervene before payout volume starts leaking.',
    icon: 'shield' as GlyphName,
  },
  {
    title: 'Track every state without stitching tools',
    desc: 'Provider acknowledgement, bank-side signals, and confirmation status live in one timeline instead of scattered systems.',
    icon: 'globe' as GlyphName,
  },
  {
    title: 'Prove what happened for finance and audit',
    desc: 'Export clear Evidence Packs with the signals, timestamps, and state transitions behind every payout outcome.',
    icon: 'book' as GlyphName,
  },
] as const

const modelBullets = [
  'Route through the healthiest provider and rail.',
  'Monitor provider, bank, and statement signals continuously.',
  'See risk, latency, and confirmation drift before the close is at risk.',
  'Export Evidence Packs and hand finance a clean answer faster.',
] as const

const footerColumns = [
  {
    title: 'Product',
    links: ['ZORD Platform', 'Operations Switchboard', 'Payout workspace', 'Evidence Packs'],
  },
  {
    title: 'Solutions',
    links: ['Marketplaces', 'NBFCs', 'Fintech & PSPs', 'Finance Ops'],
  },
  {
    title: 'Resources',
    links: ['How it Works', 'Security', 'Pricing', 'Support'],
  },
  {
    title: 'Company',
    links: ['About Arealis', 'Careers', 'Contact', 'Recognitions'],
  },
  {
    title: 'Legal',
    links: ['Privacy', 'Terms', 'Cookies', 'Compliance'],
  },
] as const

const heroDashboardMetrics = [
  { label: 'Payment instructions', value: 'Preview', chip: 'Intent Journal', icon: 'grid' as GlyphName, tone: 'sky' },
  { label: 'Fully Matched Value', value: 'Preview', chip: 'Match Confidence', icon: 'shield' as GlyphName, tone: 'slate' },
  { label: 'Unconfirmed exposure', value: 'Preview', chip: 'value at risk', icon: 'wallet' as GlyphName, tone: 'indigo' },
  { label: 'Evidence Packs', value: 'Preview', chip: 'audit-ready', icon: 'book' as GlyphName, tone: 'blue' },
] as const

const heroDashboardBars = [
  { label: '00', dispatched: 28, confirmed: 18 },
  { label: '04', dispatched: 42, confirmed: 30 },
  { label: '08', dispatched: 58, confirmed: 44 },
  { label: '12', dispatched: 82, confirmed: 68 },
  { label: '16', dispatched: 63, confirmed: 49 },
  { label: '20', dispatched: 47, confirmed: 34 },
  { label: '24', dispatched: 36, confirmed: 24 },
] as const

const surfaceCardStyle = {
  background:
    'linear-gradient(180deg, color-mix(in srgb, var(--color-brand-surface-hover) 84%, white 16%) 0%, var(--color-brand-surface) 100%)',
  boxShadow:
    '0 24px 64px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
} as const

const panelCardStyle = {
  background:
    'linear-gradient(180deg, rgba(132, 145, 156, 0.22) 0%, rgba(34, 39, 47, 0.34) 100%)',
  boxShadow:
    '0 18px 44px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(255,255,255,0.03)',
} as const

function switchboardTone(tone: 'healthy' | 'warn' | 'critical' | 'info') {
  if (tone === 'healthy') {
    return {
      border: 'rgba(34,197,94,0.22)',
      chipBackground: 'rgba(34,197,94,0.12)',
      chipColor: '#BBF7D0',
      glow: 'rgba(34,197,94,0.14)',
      line: '#22C55E',
      panel:
        'radial-gradient(circle at 100% 0%, rgba(34,197,94,0.10), transparent 34%), linear-gradient(180deg, rgba(31,35,44,0.98) 0%, rgba(14,17,23,0.98) 100%)',
    }
  }

  if (tone === 'warn') {
    return {
      border: 'rgba(234,179,8,0.24)',
      chipBackground: 'rgba(234,179,8,0.12)',
      chipColor: '#FDE68A',
      glow: 'rgba(234,179,8,0.14)',
      line: '#EAB308',
      panel:
        'radial-gradient(circle at 100% 0%, rgba(234,179,8,0.10), transparent 34%), linear-gradient(180deg, rgba(31,35,44,0.98) 0%, rgba(14,17,23,0.98) 100%)',
    }
  }

  if (tone === 'critical') {
    return {
      border: 'rgba(239,68,68,0.26)',
      chipBackground: 'rgba(239,68,68,0.12)',
      chipColor: '#FECACA',
      glow: 'rgba(239,68,68,0.16)',
      line: '#EF4444',
      panel:
        'radial-gradient(circle at 100% 0%, rgba(239,68,68,0.12), transparent 34%), linear-gradient(180deg, rgba(31,35,44,0.98) 0%, rgba(14,17,23,0.98) 100%)',
    }
  }

  return {
    border: 'rgba(99,102,241,0.24)',
    chipBackground: 'rgba(99,102,241,0.12)',
    chipColor: '#C7D2FE',
    glow: 'rgba(99,102,241,0.15)',
    line: '#6366F1',
    panel:
      'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.10), transparent 34%), linear-gradient(180deg, rgba(31,35,44,0.98) 0%, rgba(14,17,23,0.98) 100%)',
  }
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Hero() {
  const [activeSlide, setActiveSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length)
    }, 14000)

    return () => clearInterval(timer)
  }, [])

  return (
    <main className="relative z-10 overflow-hidden px-2 pb-12 pt-36 md:px-3">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.2]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div
          className="absolute left-1/2 top-[6%] h-[38rem] w-[52rem] -translate-x-1/2 rounded-full blur-[150px]"
          style={{
            background:
              'radial-gradient(circle, rgba(148, 167, 179, 0.18) 0%, rgba(46, 54, 66, 0.16) 32%, rgba(10, 10, 12, 0) 72%)',
          }}
        />
        <div
          className="absolute left-1/2 top-[24%] h-[28rem] w-[34rem] -translate-x-1/2 rounded-full blur-[130px]"
          style={{ background: 'radial-gradient(circle, rgba(255, 255, 255, 0.07) 0%, rgba(10, 10, 12, 0) 72%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1560px]">
        <button
          type="button"
          onClick={() => setActiveSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length)}
          className="absolute -left-3 top-[46%] z-30 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(214,221,227,0.28)_0%,rgba(126,136,147,0.18)_100%)] text-slate-50 shadow-[0_18px_34px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-xl transition hover:bg-[linear-gradient(180deg,rgba(228,234,239,0.32)_0%,rgba(137,148,160,0.22)_100%)] lg:flex xl:-left-6"
          aria-label="Previous hero slide"
        >
          <Glyph name="arrow-right" className="h-4 w-4 rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => setActiveSlide((current) => (current + 1) % heroSlides.length)}
          className="absolute -right-3 top-[46%] z-30 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(214,221,227,0.28)_0%,rgba(126,136,147,0.18)_100%)] text-slate-50 shadow-[0_18px_34px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-xl transition hover:bg-[linear-gradient(180deg,rgba(228,234,239,0.32)_0%,rgba(137,148,160,0.22)_100%)] lg:flex xl:-right-6"
          aria-label="Next hero slide"
        >
          <Glyph name="arrow-right" className="h-4 w-4" />
        </button>

        <motion.div
          className="overflow-hidden rounded-[2.6rem] border border-white/22 bg-[linear-gradient(180deg,rgba(210,218,226,0.18)_0%,rgba(112,123,137,0.14)_18%,rgba(28,33,40,0.46)_56%,rgba(10,10,12,0.58)_100%)] shadow-[0_35px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-[36px]"
          whileHover={{ y: -4 }}
          transition={{ duration: 0.35 }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(186,196,205,0.18),transparent_28%)]" />
          <div className="pointer-events-none absolute inset-[1px] rounded-[2.5rem] border border-white/10" />
          <div className="overflow-hidden">
            <motion.div
              className="flex"
              animate={{ x: `-${activeSlide * 100}%` }}
              transition={{ duration: 1.9, ease: [0.22, 1, 0.36, 1] }}
            >
              {heroSlides.map((slide) => (
                <div
                  key={slide.id}
                  className="grid min-w-full items-center gap-10 px-8 py-10 md:px-10 lg:grid-cols-[0.92fr_1.08fr] lg:px-14 lg:py-14"
                >
                  <div className="text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[14px] font-semibold text-[#c4d0da] shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                      <Glyph name={slide.icon} className="h-4 w-4 text-[#94A7AE]" />
                      <span>{slide.eyebrow}</span>
                    </div>

                    <h1 className="mt-8 text-5xl font-semibold leading-[1.03] tracking-[-0.06em] md:text-6xl lg:text-[5rem]">
                      <span className="block text-[#cbd6df]">{slide.headlineLead}</span>
                      <span className="mt-1 block text-white">{slide.headlineTail}</span>
                    </h1>

                    <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-2xl lg:mx-0">
                      {slide.copy}
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                      {slide.highlights.map((highlight) => (
                        <div
                          key={`${slide.id}-${highlight}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300"
                        >
                          {highlight}
                        </div>
                      ))}
                    </div>

                    <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:items-start">
                      <a
                        href="/signup"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#94A7AE]/35 bg-[#94A7AE] px-10 py-4 text-lg font-semibold text-[#0a0a0c] shadow-[0_20px_40px_rgba(148,167,179,0.18)] transition-all hover:bg-[#a7b7bf] sm:w-auto"
                      >
                        Book Demo
                        <Glyph name="arrow-right" className="h-5 w-5" />
                      </a>
                      <Link
                        href="/final-landing/how-it-works"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg font-semibold text-slate-100 transition-all hover:bg-white/10 sm:w-auto"
                      >
                        See how it works
                        <Glyph name="play" className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="relative min-h-[460px] overflow-hidden rounded-[2.2rem] border border-white/14 bg-[linear-gradient(180deg,rgba(112,123,137,0.12)_0%,rgba(25,28,34,0.8)_18%,rgba(15,18,24,0.78)_100%)] p-5 backdrop-blur-[24px] sm:min-h-[540px]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(181,191,200,0.18),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_28%)]" />
                      <div className="absolute right-4 top-5 h-[94%] w-[82%] rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(182,191,201,0.16)_0%,rgba(255,255,255,0.04)_100%)] shadow-[0_30px_70px_rgba(0,0,0,0.24)] backdrop-blur-[18px]" />
                      <div className="absolute right-5 top-8 w-[76%] sm:right-6 sm:w-[74%] lg:right-7 lg:w-[71%]">
                        <div className="relative aspect-[11/6] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1218] shadow-[0_30px_60px_rgba(0,0,0,0.36)]">
                          <Image
                            src={slide.image}
                            alt={slide.imageAlt}
                            fill
                            priority={slide.id === heroSlides[0].id}
                            sizes="(min-width: 1024px) 34vw, 88vw"
                            className={slide.imageClassName}
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,12,0.08)_0%,rgba(10,10,12,0.28)_55%,rgba(10,10,12,0.72)_100%)]" />
                        </div>
                      </div>

                      <div
                        className={`absolute left-4 top-5 z-10 rounded-[1.5rem] border border-white/16 p-3.5 shadow-[0_24px_40px_rgba(0,0,0,0.28)] backdrop-blur-[26px] sm:p-4 ${slide.panelWidthClassName}`}
                        style={panelCardStyle}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A7AE]">
                          {slide.panelLabel}
                        </div>
                        <div className="mt-2 text-[1.55rem] font-semibold tracking-[-0.06em] text-white sm:text-[1.75rem]">
                          {slide.panelTitle}
                        </div>
                        <p className="mt-2 text-[13px] leading-5 text-slate-400">
                          {slide.panelCopy}
                        </p>

                        <div className="mt-3 rounded-[0.95rem] border border-white/10 bg-white/[0.04] px-3 py-2">
                          {slide.panelCapabilities.map((capability) => (
                            <div
                              key={`${slide.id}-${capability}`}
                              className="flex items-start gap-2 border-b border-white/8 py-2 last:border-b-0 last:pb-0 first:pt-0"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#94A7AE]" />
                              <div className="text-[13px] leading-5 text-slate-200">{capability}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-24 bg-gradient-to-r from-black/18 via-black/6 to-transparent lg:block" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-24 bg-gradient-to-l from-black/18 via-black/6 to-transparent lg:block" />

          <div className="border-t border-white/10 px-6 py-5 md:px-8 lg:px-14">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="rounded-[1.3rem] border border-white/10 bg-white/5 p-2 backdrop-blur-xl">
                <div className="flex flex-wrap gap-2">
                  {heroSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                      className={`rounded-[1rem] px-4 py-2.5 text-sm font-semibold transition-all ${
                        activeSlide === index
                          ? 'bg-[#94A7AE] text-[#0a0a0c] shadow-[0_10px_24px_rgba(148,167,179,0.16)]'
                          : 'bg-transparent text-slate-300 hover:bg-white/6'
                      }`}
                      aria-pressed={activeSlide === index}
                    >
                      <span className="block">{slide.tab}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 xl:min-w-[280px] xl:justify-end">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Use-case views
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                    aria-label="Previous hero slide"
                  >
                    <Glyph name="arrow-right" className="h-4 w-4 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSlide((current) => (current + 1) % heroSlides.length)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                    aria-label="Next hero slide"
                  >
                    <Glyph name="arrow-right" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-6 rounded-[1.9rem] border border-white/12 bg-[linear-gradient(180deg,rgba(198,206,214,0.14)_0%,rgba(36,41,48,0.5)_100%)] px-6 py-5 shadow-[0_26px_56px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-[linear-gradient(180deg,rgba(214,221,227,0.22)_0%,rgba(94,104,115,0.12)_100%)] text-[#94A7AE] shadow-[0_12px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.22)]">
                <Glyph name="grid" className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Explore the stack
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight text-white">
                  Jump to the operating layer you need
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {heroBaseActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(214,221,227,0.12)_0%,rgba(35,40,47,0.34)_100%)] px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-[0_14px_24px_rgba(0,0,0,0.16)] transition hover:border-white/18 hover:bg-[linear-gradient(180deg,rgba(222,228,234,0.16)_0%,rgba(46,52,60,0.4)_100%)]"
                >
                  <Glyph name={action.icon} className="h-4 w-4 text-[#94A7AE]" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function ProductHeroVisualSection() {
  return (
    <section className="relative z-10 px-2 pb-14 md:px-3">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 p-3 sm:p-4 lg:p-5" style={surfaceCardStyle}>
          <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <div className="grid gap-4">
              <div className="relative min-h-[320px] overflow-hidden rounded-[2rem] border border-white/10 sm:min-h-[360px] lg:min-h-0 lg:aspect-[16/10]">
                <Image
                  src="/final-landing/sections/product-control-surface.png"
                  alt="Payout provider control surface showing live provider status, SLA alerts, and recovery recommendations"
                  fill
                  className="object-cover object-[center_38%]"
                  sizes="(min-width: 1280px) 640px, 100vw"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,13,0.12)_0%,rgba(7,9,13,0.72)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-[#c6efcf]" />
                    {landingHomeCopy.productHero.badge}
                  </div>
                  <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                    {landingHomeCopy.productHero.title}
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {landingHomeCopy.productHero.capabilityLabels.map((label) => (
                  <div key={label} className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="text-[15px] font-semibold tracking-tight text-white">{label}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Console capability</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative px-2 py-2 sm:px-3 lg:px-4 lg:py-4">
              <div className="pointer-events-none absolute inset-0">
                <Image
                  src="/final-landing/concepts/unified-control-system.png"
                  alt=""
                  fill
                  className="object-cover opacity-[0.08]"
                  aria-hidden="true"
                  sizes="(min-width: 1280px) 480px, 100vw"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,15,0.3)_0%,rgba(9,11,15,0.55)_100%)]" />
              </div>

              <div className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Working surface
              </div>
              <h2 className="relative mt-4 text-3xl font-semibold tracking-tight text-white">
                {landingHomeCopy.productHero.workingTitle}
              </h2>
              <p className="relative mt-5 text-[16px] leading-8 text-slate-400">
                {landingHomeCopy.productHero.workingBody}
              </p>

              <div className="relative mt-8 space-y-4">
                {landingHomeCopy.productHero.bullets.map((point) => (
                  <div key={point} className="flex items-start gap-3 text-sm leading-7 text-slate-300">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#c6efcf]" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function LiveMetricStrip({ formattedVolume: _formattedVolume }: { formattedVolume: string }) {
  return (
    <section className="relative z-10 px-2 pb-12 md:px-3">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div
            className="rounded-[2rem] border border-white/10 px-6 py-6 backdrop-blur-sm md:px-8"
            style={surfaceCardStyle}
          >
            <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Workspace preview
                </div>
                <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
                  Illustrative
                </div>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400 md:text-lg">
                  Product preview data — not production volume, uptime, or customer metrics.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ['4', 'workspace views'],
                  ['Evidence Packs', 'export path'],
                  ['Sandbox', 'evaluate first'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-[0_12px_26px_rgba(0,0,0,0.16)]">
                    <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function ProblemSection() {
  return (
    <section className="relative z-10 px-2 py-24 md:px-3">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="eye" className="h-4 w-4 text-[#3ba6f7]" />
            <span>Problem</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Payouts break across systems, not logic
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            Ops sees one dashboard, finance sees another, engineering sees logs. Nobody sees the full truth when payouts begin to drift.
          </p>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-3">
            {problemStacks.map((item) => (
              <div key={item.team} className="rounded-[1.6rem] border border-white/10 p-6" style={surfaceCardStyle}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#3ba6f7] shadow-[0_10px_20px_rgba(0,0,0,0.16)]">
                  <Glyph name={item.icon} className="h-5 w-5" />
                </div>
                <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.team}</div>
                <div className="mt-3 text-xl font-semibold tracking-tight text-white">{item.view}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[1.8rem] border border-white/10 p-8" style={surfaceCardStyle}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">What it causes</div>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">The same payout issue creates three kinds of damage.</h3>
            <div className="mt-8 space-y-4">
              {[
                ['Delayed confirmations', 'Support load rises while teams still debate where the payout is stuck.'],
                ['SLA breaches', 'Connector drift is noticed too late because the risk signal is fragmented across systems.'],
                ['Audit chaos', 'Finance and compliance ask for proof after the incident instead of during it.'],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-[0_12px_24px_rgba(0,0,0,0.14)]">
                  <div className="text-lg font-semibold text-white">{title}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">{detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SolutionSection() {
  return (
    <section className="relative z-10 px-2 py-24 md:px-3">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="layers" className="h-4 w-4 text-[#3ba6f7]" />
            <span>Solution</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            One payout truth instead of three dashboards
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            ZORD becomes the command layer between request, provider, bank, and finance close.
          </p>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {solutionPoints.map((item) => (
            <div key={item.title} className="rounded-[1.8rem] border border-white/10 p-8" style={surfaceCardStyle}>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#3ba6f7] shadow-[0_10px_20px_rgba(0,0,0,0.16)]">
                <Glyph name={item.icon} className="h-6 w-6" />
              </div>
              <h3 className="mt-8 text-2xl font-semibold tracking-tight text-white">{item.title}</h3>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductExperience() {
  const [activeView, setActiveView] = useState<(typeof switchboardViews)[number]['id']>('psp')
  const [activeDock, setActiveDock] = useState<(typeof dashboardDockItems)[number]['id']>('workspace')
  const [selectedPromptSuggestion, setSelectedPromptSuggestion] = useState<string | null>(null)
  const activeDockItem = dashboardDockItems.find((item) => item.id === activeDock)!
  const activeLens = switchboardLensDashboard[activeView]
  const chartValues = activeLens.statBars
  const totalChartBars = 92
  const selectedRangeStart = 18
  const selectedRangeEnd = 46
  const rangeLeftPercent = (selectedRangeStart / totalChartBars) * 100
  const rangeWidthPercent = ((selectedRangeEnd - selectedRangeStart + 1) / totalChartBars) * 100
  const dashboardChartData = useMemo(() => {
    const lensSeed = {
      psp: 0,
      rails: 0.6,
      provider: 1.15,
      banks: 1.7,
    }[activeView]

    return Array.from({ length: totalChartBars }, (_, index) => {
      const value = chartValues[index % chartValues.length]
      const selected = index >= selectedRangeStart && index <= selectedRangeEnd
      const selectionPeak = Math.exp(-Math.pow(index - 31, 2) / (2 * 8.5 * 8.5)) * 42000
      const shoulderPeak = Math.exp(-Math.pow(index - 40, 2) / (2 * 5.8 * 5.8)) * 18000
      const organicMotion =
        Math.sin(index * 0.29 + lensSeed) * 9000 +
        Math.cos(index * 0.11 + lensSeed * 1.4) * 5400 +
        Math.sin(index * 0.63 + lensSeed * 0.7) * 2800
      const barValue = Math.max(12000, Math.min(145000, 26000 + value * 2300 + selectionPeak + shoulderPeak + organicMotion))
      const lineValue = Math.max(-12000, Math.min(112000, 22000 + value * 1700 + selectionPeak * 0.56 + organicMotion * 0.72))
      const lineFocus = index >= selectedRangeStart - 1 && index <= selectedRangeEnd + 1 ? lineValue : null

      return {
        index,
        barValue,
        lineValue,
        lineFocus,
        selected,
      }
    })
  }, [activeView, chartValues])
  const chartDomainMax = 150000
  const bottomPanels = {
    psp: {
      routedValue: 'Processed volume',
      exceptionLoad: 'Sample batch',
      exposureForecast: 'Unconfirmed exposure',
      insightFigure: 'Connector view',
    },
    rails: {
      routedValue: 'Processed volume',
      exceptionLoad: 'Sample batch',
      exposureForecast: 'Unconfirmed exposure',
      insightFigure: 'Rail view',
    },
    provider: {
      routedValue: 'Processed volume',
      exceptionLoad: 'Sample batch',
      exposureForecast: 'Unconfirmed exposure',
      insightFigure: 'Provider view',
    },
    banks: {
      routedValue: 'Processed volume',
      exceptionLoad: 'Sample batch',
      exposureForecast: 'Unconfirmed exposure',
      insightFigure: 'Bank view',
    },
  }[activeView]
  const handleDockSelect = (dockId: (typeof dashboardDockItems)[number]['id']) => {
    const nextDock = dashboardDockItems.find((item) => item.id === dockId)
    if (!nextDock) return
    setActiveDock(nextDock.id)
    setActiveView(nextDock.defaultView)
    setSelectedPromptSuggestion(null)
  }
  const isPromptSurface = activeDockItem.surfaceMode === 'prompt'
  const isWorkspacePromptSurface = activeDock === 'workspace'
  const activePromptQuestion = selectedPromptSuggestion ?? activeDockItem.promptIntro
  const dockPathSegments = {
    home: 'home-overview',
    workspace: 'payout-command-view',
    proof: 'proof-exports-desk',
    grid: 'operations-grid',
    banks: 'bank-exception-view',
    sync: 'sync-console',
  } as const
  const activeViewSegment =
    switchboardViews
      .find((view) => view.id === activeView)
      ?.label.toLowerCase()
      .replace(/\s+/g, '-') ?? 'overview'
  const activePromptSegment = activeDockItem.promptTabs[0]?.toLowerCase().replace(/\s+/g, '-') ?? 'overview'
  const activeCommandPath = `zord.arealis.ai/${dockPathSegments[activeDock]}/${isPromptSurface ? activePromptSegment : activeViewSegment}`
  const periodOptions = [
    ['Week', false],
    ['Month', true],
    ['Quarter', false],
    ['Year', false],
  ] as const
  const promptSurfaceContent = {
    workspace: {
      heroLabel: 'Command scope',
      heroValue: 'Preview',
      heroBars: [3, 3, 11, 18, 9, 6, 2, 4, 3, 3, 3],
      listTitle: 'Connector posture',
      listRows: [
        ['Razorpay', 'Stable'],
        ['Cashfree', 'Watch'],
        ['PayU', 'Review'],
      ],
      listFooter: 'Product preview',
      listAction: 'View connectors',
      statTitle: 'Matching confidence',
      statValue: 'Preview',
      compareLabels: ['Before review', 'After review'],
      bottomTitle: 'Escalations ready',
      bottomValue: 'Sample',
      bottomMeta: 'Illustrative connector and bank-side issues for operator review.',
    },
    proof: {
      heroLabel: 'Evidence Packs',
      heroValue: 'Preview',
      heroBars: [2, 3, 8, 13, 10, 7, 4, 6, 3, 2, 2],
      listTitle: 'Evidence sources',
      listRows: [
        ['Statements', 'Linked'],
        ['Confirmations', 'Linked'],
        ['Exports', 'Pending'],
      ],
      listFooter: 'Product preview',
      listAction: 'Review proof queue',
      statTitle: 'Close confidence',
      statValue: 'Preview',
      compareLabels: ['Audit', 'Close'],
      bottomTitle: 'Export queue',
      bottomValue: 'Sample',
      bottomMeta: 'Illustrative packets waiting on final assembly.',
    },
    grid: {
      heroLabel: 'Shared work queues',
      heroValue: 'Preview',
      heroBars: [3, 5, 7, 10, 12, 9, 8, 6, 4, 3, 2],
      listTitle: 'Team workload',
      listRows: [
        ['Support', 'Sample'],
        ['Finance', 'Sample'],
        ['Engineering', 'Sample'],
      ],
      listFooter: 'Product preview',
      listAction: 'Open handoff view',
      statTitle: 'Cross-team alignment',
      statValue: 'Preview',
      compareLabels: ['Today', 'Next'],
      bottomTitle: 'Blocked handoffs',
      bottomValue: 'Sample',
      bottomMeta: 'Illustrative cases still waiting for clear ownership',
    },
    sync: {
      heroLabel: 'Workspace sync',
      heroValue: 'Preview',
      heroBars: [2, 4, 5, 7, 12, 11, 9, 6, 4, 3, 2],
      listTitle: 'Freshness checks',
      listRows: [
        ['Board sync', 'Linked'],
        ['Data refresh', 'Linked'],
        ['Evidence refresh', 'Pending'],
      ],
      listFooter: 'Product preview',
      listAction: 'Inspect freshness',
      statTitle: 'Delta resolved',
      statValue: 'Preview',
      compareLabels: ['Before', 'After'],
      bottomTitle: 'Stale panels',
      bottomValue: 'Sample',
      bottomMeta: 'Illustrative surfaces waiting on the next refresh cycle',
    },
  } as const
  const activePromptSurface =
    promptSurfaceContent[activeDock as keyof typeof promptSurfaceContent] ??
    promptSurfaceContent.workspace

  const lensSwitcher = (
    <div className="mt-6 flex flex-wrap gap-2">
      {switchboardViews.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => setActiveView(view.id)}
          className={`rounded-full px-4 py-2.5 text-[13px] font-medium transition ${
            activeView === view.id ? 'border-[#111111] bg-[#111111] text-white' : 'border-black/10 bg-white text-[#5f615d]'
          } border shadow-[0_6px_16px_rgba(0,0,0,0.04)]`}
        >
          {view.label}
        </button>
      ))}
    </div>
  )

  const promptPanel = (
    <div className="rounded-[1.7rem] border border-black/10 bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {activeDockItem.promptTabs.map((tab, index) => (
              <button
                key={`${activeDockItem.id}-${tab}`}
                type="button"
                className={`rounded-full px-4 py-2.5 text-[13px] font-medium transition ${
                  index === 0
                    ? 'bg-[#d7e4f4] text-[#111111]'
                    : 'bg-[#f3f4f6] text-[#6c6f77]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center self-end rounded-[12px] border border-black/10 bg-white text-[#111111] lg:self-auto"
            aria-label="Prompt layer documents"
          >
            <Glyph name="document" className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="min-h-[13rem] flex-1 rounded-[1.4rem] border border-black/10 bg-[#fbfbfc] p-4 sm:p-5">
          {isWorkspacePromptSurface ? (
            <div className="mb-5 flex flex-col gap-3 border-b border-black/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a8a86]">
                  Ask Zord
                </div>
                <div className="mt-2 text-[1.15rem] font-medium tracking-[-0.03em] text-[#111111]">
                  Operator context, connector posture, and Proof Readiness in one reasoning layer.
                </div>
              </div>
              <div className="inline-flex rounded-full bg-[#eef1f5] px-3 py-2 text-[12px] font-medium text-[#111111]">
                Live operating context
              </div>
            </div>
          ) : null}

          <div className="inline-flex max-w-[28rem] rounded-[1.15rem] bg-[#eef1f5] px-6 py-4 text-[15px] text-[#111111]">
            {activePromptQuestion}
          </div>
          <div className="mt-2 text-[12px] text-[#8a8a86]">11:32 AM</div>

          <div className="mt-6 flex flex-wrap gap-2">
            {activeDockItem.promptSuggestions.map((suggestion) => (
              <button
                key={`${activeDockItem.id}-${suggestion}`}
                type="button"
                onClick={() => setSelectedPromptSuggestion(suggestion)}
                className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-[#6f716d] shadow-[0_4px_12px_rgba(0,0,0,0.03)] transition hover:border-[#4ADE80]/30 hover:text-[#111111]"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {isWorkspacePromptSurface ? (
            <div className="mt-5 text-[12px] leading-5 text-[#8a8a86]">
              Grounded on processed payment value, confirmation timing, bank-side movement, and Evidence Pack readiness already visible in the workspace.
            </div>
          ) : null}

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {activeDockItem.promptTiles.map((tile) => (
              <article
                key={`${activeDockItem.id}-${tile.title}`}
                className="rounded-[1.2rem] border border-black/10 bg-white px-5 py-5 text-[#111111] shadow-[0_10px_24px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#eef1f5] text-[#111111]">
                    <Glyph name={tile.icon} className="h-4 w-4" />
                  </div>
                  <div className="text-[1.05rem] font-medium tracking-[-0.03em] text-[#111111]">
                    {tile.title}
                  </div>
                </div>
                  {isWorkspacePromptSurface ? (
                    <span className="rounded-full bg-[#eef1f5] px-2.5 py-1 text-[11px] font-medium text-[#6f716d]">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-[13px] leading-6 text-[#6f716d]">
                  {tile.body}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-[1.2rem] border border-black/10 bg-[#eef1f5] px-3 py-3 sm:flex-row sm:items-center">
          <div className="flex-1 px-2 text-[15px] text-[#8a8a86]">
            {activeDockItem.promptPlaceholder}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[#111111]"
              aria-label="Prompt tools"
            >
              <Glyph name="grid" className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-black/10 bg-[#d7e4f4] text-[#111111]"
              aria-label="Send prompt"
            >
              <Glyph name="arrow-up-right" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const workspacePromptPanel = (
    <article className="flex min-h-[48rem] flex-col rounded-[1.85rem] border border-white/8 bg-[#111111] p-4 text-white shadow-[0_24px_56px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {activeDockItem.promptTabs.map((tab, index) => (
            <button
              key={`workspace-panel-${tab}`}
              type="button"
              className={`rounded-full border px-4 py-2.5 text-[13px] font-medium transition ${
                index === 0
                  ? 'border-white/14 bg-white/10 text-white'
                  : 'border-white/10 bg-[#161616] text-white/58'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-[#161616] text-white/70"
          aria-label="Workspace documents"
        >
          <Glyph name="document" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mt-5 flex flex-1 flex-col rounded-[1.5rem] border border-white/8 bg-[#151515] px-4 py-5 sm:px-5">
        <div className="border-b border-white/8 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[28rem]">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/32">
                Ask Zord
              </div>
              <div className="mt-2 text-[1.1rem] font-medium tracking-[-0.03em] text-white">
                Connector posture, ownership handoff, and Proof Readiness in one reasoning layer.
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#4ADE80]/20 bg-[#4ADE80]/10 px-3 py-2 text-[12px] font-medium text-white shadow-[0_8px_24px_rgba(74,222,128,0.08)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
              Live operating context
            </div>
          </div>

          <div className="mt-5 rounded-[1.35rem] border border-white/8 bg-[#1A1A1A] p-4 sm:p-5">
            <div className="inline-flex items-center gap-2 rounded-full px-0 py-0 text-[11px] font-medium uppercase tracking-[0.16em] text-[#4ADE80]">
              <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
              Live reasoning prompt
            </div>
            <div className="mt-4 max-w-[34rem] text-[1.08rem] leading-7 tracking-[-0.03em] text-white">
              {activePromptQuestion}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
              <span className="text-[#4ADE80]">11:32 AM</span>
              <span className="h-1 w-1 rounded-full bg-[#4ADE80]" />
              <span className="max-w-[33rem] text-white/48">
              {H.askZord.processedSupporting}
              </span>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/32">
              Suggested Questions
            </div>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {activeDockItem.promptSuggestions.map((suggestion) => (
                <button
                  key={`workspace-prompt-suggestion-${suggestion}`}
                  type="button"
                  onClick={() => setSelectedPromptSuggestion(suggestion)}
                  className={`rounded-full border px-4 py-2.5 text-[13px] shadow-[0_8px_20px_rgba(0,0,0,0.14)] transition ${
                    activePromptQuestion === suggestion
                      ? 'border-[#4ADE80]/38 bg-[#171717] text-white'
                      : 'border-white/10 bg-[#111111] text-white/78 hover:border-[#4ADE80]/32 hover:text-white'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex-1">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-white/32">
            Operator Modules
          </div>
          <div className="grid gap-3 md:grid-cols-2">
          {activeDockItem.promptTiles.map((tile) => (
            <article
              key={`workspace-tile-${tile.title}`}
              className="rounded-[1.25rem] border border-white/8 bg-[#1B1B1B] px-5 py-5 shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#4ADE80]/12 text-[#4ADE80]">
                  <Glyph name={tile.icon} className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[1.05rem] font-medium tracking-[-0.03em] text-white">
                    {tile.title}
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-white/48">
                    {tile.body}
                  </p>
                </div>
              </div>
            </article>
          ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[1.35rem] bg-[#1F1F1F] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
        <div className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-[#232323] p-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[0.85rem] bg-[#4ADE80] text-[#111111]">
            <Glyph name="zap" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-[15px] text-white/90">{H.askZord.composerPlaceholder}</div>
            <div className="mt-1 text-[11px] text-white/42">
              Connector posture, bank coordination, and Proof Readiness
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white"
              aria-label="Workspace help"
            >
              <span className="text-base font-medium">?</span>
            </button>
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white"
              aria-label="Workspace tools"
            >
              <Glyph name="grid" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )

  const workspacePromptSurface = (
    <div className="mt-8 grid items-stretch gap-4 xl:grid-cols-[1.78fr_1.46fr]">
      <div className="grid gap-4 xl:grid-cols-[0.98fr_0.84fr]">
        <article className="flex min-h-[33.5rem] flex-col justify-between rounded-[1.7rem] border border-[#cfdaea] bg-[#DDE8F8] p-6 shadow-[0_12px_28px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="max-w-[11rem] text-[11px] font-medium uppercase leading-5 tracking-[0.1em] text-[#5c7194]">{activePromptSurface.heroLabel}</div>
              <div className="mt-6 text-[4.35rem] font-light tracking-[-0.06em] text-[#111111]">
                {activePromptSurface.heroValue}
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/70 text-[#5b76a1]">
              <Glyph name="document" className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-10 flex items-end justify-start gap-[0.48rem]">
            {activePromptSurface.heroBars.map((height, index) => (
              <span
                key={`workspace-bar-${activeDock}-${index}`}
                className="w-[1rem] rounded-[0.55rem]"
                style={{
                  height: `${height * 1.08}rem`,
                  background: index < 2 || index > 7 ? '#aac1de' : '#355695',
                }}
              />
            ))}
          </div>
        </article>

        <div className="flex flex-col gap-4">
          <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
            <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#9a9a95]">{activePromptSurface.listTitle}</div>
            <div className="mt-7 space-y-4">
              {activePromptSurface.listRows.map(([label, value]) => (
                <div key={`workspace-list-${label}`}>
                  <div className="flex items-center justify-between gap-3 text-[#111111]">
                    <span className="text-[15px]">{label}</span>
                    <span className="text-[15px] font-medium">{value}</span>
                  </div>
                  <div className="mt-3 h-px bg-black/8" />
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="text-[13px] text-[#8a8a86]">{activePromptSurface.listFooter}</div>
              <button
                type="button"
                className="rounded-[1rem] border border-black/10 bg-[#f5f4ef] px-4 py-2.5 text-[13px] text-[#111111]"
              >
                {activePromptSurface.listAction}
              </button>
            </div>
          </article>

          <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
            <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#9a9a95]">{activePromptSurface.statTitle}</div>
            <div className="mt-5 text-[3.6rem] font-light tracking-[-0.06em] text-[#111111]">
              {activePromptSurface.statValue}
            </div>
            <div className="mt-2 text-[13px] leading-6 text-[#8a8a86]">Illustrative workspace metric</div>
          </article>

          <div className="grid grid-cols-2 gap-4">
            {activePromptSurface.compareLabels.map((label, index) => (
              <article
                key={`workspace-compare-${label}`}
                className={`rounded-[1.45rem] border p-4 shadow-[0_10px_24px_rgba(0,0,0,0.04)] ${
                  index === 0 ? 'border-black/10 bg-white' : 'border-[#cfdaea] bg-[#DDE8F8]'
                }`}
              >
                <div className={`text-[13px] font-medium leading-5 ${index === 0 ? 'text-[#a1a19b]' : 'text-[#446ea7]'}`}>
                  {label}
                </div>
                <div className="mt-6 flex h-24 items-end gap-[0.42rem]">
                  {[3, 5, 4, 7, 5].map((height, barIndex) => (
                    <span
                      key={`workspace-compare-bar-${label}-${barIndex}`}
                      className="w-[1.02rem] rounded-[0.45rem]"
                      style={{
                        height: `${height * 0.92}rem`,
                        background: index === 0 ? '#d8d8d3' : '#355695',
                      }}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)] xl:col-span-2">
          <div className="text-[13px] font-medium uppercase tracking-[0.1em] text-[#9a9a95]">{activePromptSurface.bottomTitle}</div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="text-[3.1rem] font-light tracking-[-0.05em] text-[#111111]">
              {activePromptSurface.bottomValue}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/10 bg-[#fafafa] text-[#8a8a86]">
              <Glyph name="arrow-up-right" className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 max-w-[30rem] text-[13px] leading-7 text-[#8a8a86]">{activePromptSurface.bottomMeta}</div>
        </article>
      </div>

      {workspacePromptPanel}
    </div>
  )

  const analyticsSurface = (
    <div className="mt-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8b8a86]">
            Half-year payout statement
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-[#6f716d]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#d4d4d4]" />
              <span>{activeLens.beforeLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#111111]" />
              <span>{activeLens.afterLabel}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-[#6f716d] sm:grid-cols-4">
          {periodOptions.map(([label, active]) => (
            <div
              key={`${activeView}-${label}`}
              className={`rounded-full px-3 py-2 text-center ${active ? 'border border-black/10 bg-white text-[#111111]' : 'text-[#7f817c]'}`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 text-center">
        <div className="text-[4.8rem] font-light tracking-[-0.03em] text-[#111111] md:text-[6rem] lg:text-[6.6rem]">
          {activeLens.metric}
        </div>
        <div className="mt-2 text-lg font-normal text-[#111111]">{activeLens.title}</div>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-6 text-[#6f716d]">
          {activeLens.summary}
        </p>
      </div>

      <div className="relative mt-10 rounded-[2rem] border border-black/10 bg-white px-4 py-6 shadow-[0_14px_32px_rgba(0,0,0,0.04)] sm:px-5 lg:px-6">
        <div
          className="pointer-events-none absolute bottom-[4.9rem] top-6 z-0 bg-white/70"
          style={{ left: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%`, opacity: 0.08 }}
        />

        <div className="absolute left-[42%] top-[34%] z-10 w-[15rem] rounded-lg border-[0.5px] border-[#E0E0DE] bg-white px-3.5 py-3 sm:w-[16.5rem]">
          <button
            type="button"
            className="absolute right-2 top-2 text-[10px] leading-none text-[#999999]"
            aria-label="Dismiss chart note"
          >
            ×
          </button>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[16px] font-semibold text-[#111111]">{activeLens.statValue}</div>
            <span className="inline-flex h-6 items-center rounded-full bg-[#22C55E] px-2.5 text-[10px] font-medium text-[#166534]">
              {activeLens.statChange}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-normal leading-4 text-[#8b8a86]">{activeLens.statNote}</div>
        </div>

        <div className="relative z-[1] h-[20.5rem] md:h-[22rem]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dashboardChartData} margin={{ top: 10, right: 26, left: 0, bottom: 0 }} barGap={2}>
              <XAxis hide dataKey="index" />
              <YAxis
                orientation="right"
                axisLine={false}
                tickLine={false}
                tickMargin={14}
                domain={[-50000, 150000]}
                ticks={[-50000, 0, 50000, 100000, 150000]}
                tickFormatter={(value: number) => (value < 0 ? `-${Math.abs(value) / 1000}k` : value === 0 ? '0' : `${value / 1000}k`)}
                tick={{ fill: '#999999', fontSize: 11, fontWeight: 400 }}
              />
              <Bar dataKey="barValue" barSize={5} radius={[0, 0, 0, 0]} isAnimationActive>
                {dashboardChartData.map((entry) => (
                  <Cell key={`${activeView}-bar-${entry.index}`} fill={entry.selected ? '#1A1A1A' : '#7C7C7C'} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="lineValue"
                stroke="#AAAAAA"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                strokeLinecap="round"
                connectNulls
                isAnimationActive
              />
              <Line
                type="monotone"
                dataKey="lineFocus"
                stroke="#111111"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                strokeLinecap="round"
                connectNulls
                isAnimationActive
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 h-[13px] rounded-[4px] bg-[#EBEBEA]">
          <div
            className="relative h-[13px] rounded-[4px] bg-[#C5C5C2]"
            style={{ marginLeft: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%` }}
          >
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#444444]" />
            <div className="absolute inset-y-0 right-0 w-[3px] bg-[#444444]" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-9 text-[11px] text-[#999999]">
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((label) => (
            <div key={`${activeView}-${label}`} className="text-center">
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8b8a86]">
            Processed volume
          </div>
          <div className="mt-4 text-[2.5rem] font-light tracking-[-0.04em] text-[#111111]">
            {bottomPanels.routedValue}
          </div>
          <div className="mt-1 text-sm text-[#6f716d]">Illustrative workspace preview — not live customer data.</div>
          <div className="mt-5 flex items-center gap-3 text-[12px] text-[#8b8a86]">
            <span>Week</span>
            <span className="border-b border-[#111111] pb-0.5 text-[#111111]">Month</span>
            <span>Quarter</span>
            <span>Year</span>
          </div>
          <div className="mt-5 flex items-end gap-3">
            {dashboardChartData.slice(0, 6).map((entry) => (
              <span
                key={`forecast-${entry.index}`}
                className="w-2 rounded-full bg-[#111111]"
                style={{ height: `${Math.max(entry.barValue / chartDomainMax, 0.22) * 5.5}rem`, opacity: entry.selected ? 1 : 0.24 }}
              />
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8b8a86]">
            Monthly exception load
          </div>
          <div className="mt-4 text-[2.5rem] font-light tracking-[-0.04em] text-[#111111]">
            {bottomPanels.exceptionLoad}
          </div>
          <div className="mt-1 text-sm text-[#6f716d]">Open items across provider, bank, and proof workflows.</div>
          <div className="mt-5 space-y-3">
            {activeLens.chips.slice(0, 3).map((chip, index) => (
              <div key={chip}>
                <div className="flex items-center justify-between text-[12px] text-[#6f716d]">
                  <span>{chip}</span>
                  <span>{[64, 49, 33][index]}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#e7e7e7]">
                  <div
                    className={`h-1.5 rounded-full ${index === 0 ? 'bg-[#111111]' : index === 1 ? 'bg-[#4ADE80]' : 'bg-[#8c8c89]'}`}
                    style={{ width: `${[64, 49, 33][index]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8b8a86]">
            Bank exposure forecast
          </div>
          <div className="mt-4 text-[2.5rem] font-light tracking-[-0.04em] text-[#111111]">
            {bottomPanels.exposureForecast}
          </div>
          <div className="mt-1 text-sm text-[#6f716d]">Expected value still exposed to confirmation delay and bank-side drift.</div>
          <div className="mt-6 flex items-end gap-2">
            {dashboardChartData.slice(8, 16).map((entry) => (
              <span
                key={`exposure-${entry.index}`}
                className="w-full rounded-full bg-[#111111]"
                style={{ height: `${Math.max(entry.lineValue / chartDomainMax, 0.16) * 4.8}rem`, opacity: 0.2 + (entry.index % 4) * 0.14 }}
              />
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8b8a86]">
            Insight
          </div>
          <div className="mt-4 max-w-[14rem] text-lg leading-7 text-[#111111]">
            {activeLens.responses[0]}
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-[2rem] font-light tracking-[-0.04em] text-[#111111]">
                {bottomPanels.insightFigure}
              </div>
              <div className="text-sm text-[#6f716d]">traces in the active review set</div>
            </div>
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden="true">
                <path d="M12 60a48 48 0 0 1 96 0" fill="none" stroke="#d9d9d9" strokeWidth="8" strokeLinecap="round" />
                <path d="M12 60a48 48 0 0 1 74 -37" fill="none" stroke="#111111" strokeWidth="8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </article>
      </div>

      <div className="relative z-10 mx-auto -mt-10 w-full max-w-[62rem] px-4">
        <div className="rounded-[1.35rem] bg-[#1F1F1F] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              'What changed across processed payout quality?',
              'Why did Proof Readiness shift this cycle?',
            ].map((prompt) => (
              <div
                key={`home-command-${prompt}`}
                className="rounded-[0.9rem] bg-white/10 px-3 py-2 text-[12px] text-white/74"
              >
                {prompt}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-[#232323] p-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[0.85rem] bg-[#4ADE80] text-[#111111]">
              <Glyph name="zap" className="h-5 w-5" />
            </div>
            <div className="flex-1 text-center text-[15px] text-white/90">
              Ask anything or search
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white"
                aria-label="Home overview help"
              >
                <span className="text-base font-medium">?</span>
              </button>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white"
                aria-label="Home overview tools"
              >
                <Glyph name="grid" className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const promptSurface = (
    <div className="mt-8 grid gap-4 xl:grid-cols-[0.9fr_0.95fr_1.55fr]">
      <div className="space-y-4">
        <article className="flex min-h-[31rem] flex-col justify-between rounded-[1.7rem] border border-[#c9d5e5] bg-[#d7e4f4] p-6 shadow-[0_12px_28px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[15px] text-[#617080]">{activePromptSurface.heroLabel}</div>
              <div className="mt-5 text-[3.7rem] font-light tracking-[-0.05em] text-[#111111]">
                {activePromptSurface.heroValue}
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/10 bg-white/60 text-[#111111]">
              <Glyph name="document" className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-8 flex items-end justify-center gap-2">
            {activePromptSurface.heroBars.map((height, index) => (
              <span
                key={`prompt-bar-${activeDock}-${index}`}
                className="w-5 rounded-full"
                style={{
                  height: `${height}rem`,
                  background: index < 2 || index > 7 ? '#abc0d8' : '#111111',
                }}
              />
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 text-[#111111] shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] text-[#8a8a86]">{activePromptSurface.bottomTitle}</div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="text-[2.9rem] font-light tracking-[-0.05em] text-[#111111]">
              {activePromptSurface.bottomValue}
            </div>
            <Glyph name="arrow-up-right" className="h-5 w-5 text-[#8a8a86]" />
          </div>
          <div className="mt-4 text-[13px] leading-6 text-[#6f716d]">{activePromptSurface.bottomMeta}</div>
        </article>
      </div>

      <div className="space-y-4">
        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 text-[#111111] shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] text-[#8a8a86]">{activePromptSurface.listTitle}</div>
          <div className="mt-6 space-y-4">
            {activePromptSurface.listRows.map(([label, value]) => (
              <div key={`${activeDock}-${label}`}>
                <div className="flex items-center justify-between gap-3 text-[#111111]">
                  <span className="text-[15px]">{label}</span>
                  <span className="text-[15px] font-medium">{value}</span>
                </div>
                <div className="mt-2 h-px bg-black/8" />
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="text-[13px] text-[#6f716d]">{activePromptSurface.listFooter}</div>
            <button
              type="button"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-[13px] text-[#111111]"
            >
              {activePromptSurface.listAction}
            </button>
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-black/10 bg-white p-5 text-[#111111] shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          <div className="text-[13px] text-[#8a8a86]">{activePromptSurface.statTitle}</div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="text-[3.1rem] font-light tracking-[-0.05em] text-[#111111]">
              {activePromptSurface.statValue}
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {activePromptSurface.compareLabels.map((label, index) => (
              <div
                key={`${activeDock}-${label}`}
                className={`rounded-[1rem] px-4 pb-4 pt-6 text-center ${
                  index === 0
                    ? 'border border-black/10 bg-[repeating-linear-gradient(135deg,rgba(215,228,244,0.42)_0_12px,rgba(255,255,255,0.9)_12px_24px)]'
                    : 'bg-[#d7e4f4] text-[#111111]'
                }`}
              >
                <div className="mx-auto h-14 w-full rounded-[0.8rem] border border-transparent" />
                <div className={`mt-4 text-[14px] ${index === 0 ? 'text-[#6f716d]' : 'text-[#5e6774]'}`}>{label}</div>
              </div>
            ))}
          </div>
        </article>
      </div>

      {promptPanel}
    </div>
  )

  return (
    <section id="product" className="relative z-10 overflow-hidden scroll-mt-32 px-2 py-24 md:px-3">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-20 h-[56rem] w-[56rem] -translate-x-1/2 rounded-full blur-[180px]"
          style={{ background: 'radial-gradient(circle, rgba(59, 166, 247, 0.12) 0%, rgba(148, 163, 184, 0.08) 36%, rgba(10, 10, 12, 0) 72%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[88rem]">
        <Reveal className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="grid" className="h-4 w-4 text-[#3ba6f7]" />
            <span>{landingHomeCopy.switchboard.eyebrow}</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            {landingHomeCopy.switchboard.title}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            {landingHomeCopy.switchboard.subcopy}
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
            {landingHomeCopy.productPreviewLabel}
          </p>
        </Reveal>

        <div
          className="rounded-[2.4rem] border border-white/10 p-2.5 sm:p-3.5 lg:p-4"
          style={{
            background:
              'linear-gradient(180deg, rgba(18,20,26,0.98) 0%, rgba(10,12,16,1) 100%)',
            boxShadow:
              '0 34px 80px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#ebebeb] shadow-[0_28px_68px_rgba(0,0,0,0.18)]">
            <div className="flex min-h-[56px] flex-col gap-4 bg-black px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  {['#ff7b70', '#ffd15c', '#61d66d'].map((color) => (
                    <span key={color} className="h-3.5 w-3.5 rounded-full" style={{ background: color }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  <Glyph name="arrow-right" className="h-4 w-4 rotate-180" />
                  <Glyph name="arrow-right" className="h-4 w-4" />
                </div>
                <div className="hidden items-center gap-3 rounded-full bg-white/[0.12] px-4 py-2 text-sm text-white/78 md:flex">
                  <span className="h-2 w-2 rounded-full bg-white/80" />
                  <span>{activeCommandPath}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-white/80">
                <Glyph name="search" className="h-4 w-4" />
                <Glyph name="chat" className="h-4 w-4" />
                <Glyph name="grid" className="h-4 w-4" />
              </div>
            </div>

            <div className="p-4 sm:p-5 lg:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-[15px] font-medium tracking-[-0.02em] text-[#111111]">Zord</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {dashboardDockItems.map((item) => {
                      const active = item.id === activeDock
                      return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleDockSelect(item.id)}
                        title={item.label}
                        aria-label={item.label}
                        aria-pressed={active}
                        className={`flex h-8 w-8 items-center justify-center rounded-[10px] border text-[#111111] transition ${
                          active ? 'border-[#111111] bg-[#111111] text-white' : 'border-black/10 bg-white'
                        }`}
                      >
                        <Glyph name={item.icon} className="h-[18px] w-[18px]" />
                      </button>
                    )})}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex h-10 min-w-[17rem] items-center gap-3 rounded-[12px] border border-black/10 bg-white px-3.5 text-[#7a7a76] shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <Glyph name="search" className="h-4 w-4 text-[#111111]" />
                    <span className="text-sm">Type client name or payout ID...</span>
                  </div>
                  {['chat', 'menu-dots'].map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white text-[#111111]"
                      aria-label={icon === 'chat' ? 'Notifications' : 'Settings'}
                    >
                      <Glyph name={icon as GlyphName} className="h-4 w-4" />
                    </button>
                  ))}
                  <div className="flex items-center gap-3 rounded-[14px] border border-black/10 bg-white px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-sm font-medium text-white">
                      OS
                    </div>
                    <div className="pr-1">
                      <div className="text-sm font-medium text-[#111111]">Ops supervisor</div>
                      <div className="text-xs text-[#7a7a76]">Payout desk</div>
                    </div>
                  </div>
                </div>
              </div>

              {isWorkspacePromptSurface ? (
                <div className="mt-6 px-0 py-0">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#8a8a86]">
                        <span>Workspaces</span>
                        <span>/</span>
                        <span>{activeDockItem.breadcrumb}</span>
                        <span>/</span>
                        <span className="text-[#111111]">{activeDockItem.heading}</span>
                      </div>
                      <div className="mt-3 text-[2.35rem] font-medium tracking-[-0.05em] text-[#111111] md:text-[2.85rem]">
                        {activeDockItem.heading}
                      </div>
                      <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#6f716d]">
                        {activeDockItem.summary}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {['refresh', 'eye', 'menu-dots'].map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#111111]"
                          aria-label={icon}
                        >
                          <Glyph name={icon as GlyphName} className="h-4 w-4" />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="flex items-center gap-3 rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-[#111111] shadow-[0_8px_20px_rgba(0,0,0,0.06)]"
                      >
                        <div className="flex -space-x-2">
                          {['A', 'F', 'E'].map((item, index) => (
                            <span
                              key={item}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 text-[11px] font-medium text-[#111111]"
                              style={{ background: ['#d8e6ff', '#dbf7dd', '#edd8f4'][index] }}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                        <span>Share</span>
                      </button>
                    </div>
                  </div>

                  {workspacePromptSurface}
                </div>
              ) : (
                <>
                  <div className="mt-6 flex flex-col gap-4 border-b border-black/10 pb-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#8a8a86]">
                          <span>Workspaces</span>
                          <span>/</span>
                          <span>{activeDockItem.breadcrumb}</span>
                          <span>/</span>
                          <span className="text-[#111111]">{activeDockItem.heading}</span>
                        </div>
                        <div className="mt-3 text-[2.2rem] font-medium tracking-[-0.05em] text-[#111111] md:text-[2.7rem]">
                          {activeDockItem.heading}
                        </div>
                        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#6f716d]">
                          {activeDockItem.summary}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {['refresh', 'eye', 'menu-dots'].map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/10 bg-white text-[#111111]"
                            aria-label={icon}
                          >
                            <Glyph name={icon as GlyphName} className="h-4 w-4" />
                          </button>
                        ))}
                        <button
                          type="button"
                          className="flex items-center gap-3 rounded-[12px] bg-[#111111] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                        >
                          <div className="flex -space-x-2">
                            {['A', 'F', 'E'].map((item) => (
                              <span key={item} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-[#ebebeb] text-[11px] font-medium text-[#111111]">
                                {item}
                              </span>
                            ))}
                          </div>
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <>
                      {!isPromptSurface ? lensSwitcher : null}
                      {isPromptSurface ? promptSurface : analyticsSurface}
                  </>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative z-10 scroll-mt-32 px-2 py-24 md:px-3">
      <div className="mx-auto max-w-6xl grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="layers" className="h-4 w-4 text-[#3ba6f7]" />
            <span>How it works</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            {landingHomeCopy.howItWorks.title}
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400 md:text-xl">
            {landingHomeCopy.howItWorks.body}
          </p>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          {orchestrationStages.map((stage, index) => (
            <div key={stage.step} className="rounded-[1.8rem] border border-white/10 p-6" style={surfaceCardStyle}>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-semibold text-white">
                  {stage.step}
                </div>
                <div className={`text-sm font-semibold ${index === 3 ? 'text-[#3ba6f7]' : 'text-slate-300'}`}>{stage.footnote}</div>
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-white">{stage.label}</h3>
              <p className="mt-3 text-base leading-7 text-slate-400">{stage.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MetricsSection() {
  return (
    <section className="relative z-10 px-2 py-24 md:px-3">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Scale that earns trust.</h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            Once the operating model is clear, the numbers explain why teams trust the layer.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-2 lg:grid-cols-4">
          {impactStats.map((item) => (
            <div key={item.label} className="rounded-[1.8rem] border border-white/10 p-8" style={surfaceCardStyle}>
              <div className="text-5xl font-semibold tracking-tight text-white md:text-6xl">{item.value}</div>
              <div className="mt-4 text-base text-slate-400">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CapabilitiesSection() {
  return (
    <section id="use-cases" className="relative z-10 mx-auto max-w-6xl scroll-mt-32 px-2 py-24 md:px-3">
      <Reveal className="mb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
          <Glyph name="shield" className="h-4 w-4 text-[#3ba6f7]" />
          <span>Capabilities</span>
        </div>
        <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
          What it actually does
        </h2>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-3">
        {capabilityBuckets.map((item) => (
          <div key={item.title} className="rounded-[1.8rem] border border-white/10 p-8" style={surfaceCardStyle}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#3ba6f7] shadow-[0_10px_20px_rgba(0,0,0,0.16)]">
              <Glyph name={item.icon} className="h-6 w-6" />
            </div>
            <h3 className="mt-8 text-2xl font-semibold tracking-tight text-white">{item.title}</h3>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">{item.description}</p>
            <div className="mt-6 space-y-3">
              {item.bullets.map((bullet) => (
                <div key={bullet} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#3ba6f7]" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function InfrastructureSection() {
  return (
    <section id="security" className="relative z-10 overflow-hidden scroll-mt-32 px-2 py-24 md:px-3">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="bank" className="h-4 w-4 text-[#3ba6f7]" />
            <span>Infrastructure depth</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            {landingHomeCopy.infrastructure.title}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            {landingHomeCopy.infrastructure.subtitle}
          </p>
        </Reveal>

        <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 p-5 sm:p-6 lg:p-8" style={surfaceCardStyle}>
          <div className="pointer-events-none absolute inset-0">
            <Image
              src="/final-landing/concepts/infrastructure-depth-system.png"
              alt=""
              fill
              className="object-cover opacity-[0.11]"
              aria-hidden="true"
              sizes="(min-width: 1280px) 1152px, 100vw"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,14,0.92)_0%,rgba(8,10,14,0.82)_24%,rgba(8,10,14,0.9)_100%)]" />
          </div>

          <div className="relative grid gap-6">
            <div className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr] lg:items-start">
              <div className="px-2 py-2 sm:px-3 lg:px-4 lg:py-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72">
                <span className="h-2 w-2 rounded-full bg-[#3ba6f7]" />
                Enterprise depth
              </div>

              <h3 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl lg:text-[3.6rem] lg:leading-[0.96]">
                {landingHomeCopy.infrastructure.headline}
              </h3>

              <p className="mt-5 max-w-2xl text-[17px] leading-8 text-slate-300 sm:text-[18px]">
                {landingHomeCopy.infrastructure.body}
              </p>
              </div>

              <div className="relative min-h-[340px] overflow-hidden rounded-[1.9rem] border border-white/10 sm:min-h-[420px] lg:min-h-0 lg:self-start lg:aspect-[16/11]">
                <Image
                  src="/final-landing/sections/finance-ops-collaboration.png"
                  alt="Finance and operations leaders reviewing payout evidence and reconciliation signals together"
                  fill
                  className="object-cover object-[center_32%]"
                  priority
                  sizes="(min-width: 1280px) 560px, 100vw"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,13,0.06)_0%,rgba(7,9,13,0.28)_42%,rgba(7,9,13,0.84)_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,166,247,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(198,239,207,0.10),transparent_26%)]" />
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                  <div className="max-w-md rounded-[1.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,27,0.72),rgba(10,12,16,0.52))] px-5 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A7AE]">Shared payout truth</div>
                    <p className="mt-3 text-[15px] leading-7 text-white/86">
                      The same control layer teams use for connector review, confirmation confidence, reconciliation, and Evidence Pack export.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {resultsShowcaseStats.map((item, index) => (
                <div
                  key={item.label}
                  className="rounded-[1.35rem] border border-white/10 p-5"
                  style={{
                    background:
                      index === 1
                        ? 'radial-gradient(circle at 100% 0%, rgba(59,166,247,0.10), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.96) 0%, rgba(11,13,18,0.98) 100%)'
                        : index === 3
                        ? 'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.10), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.96) 0%, rgba(11,13,18,0.98) 100%)'
                        : 'linear-gradient(180deg, rgba(22,28,38,0.92) 0%, rgba(11,13,18,0.98) 100%)',
                    boxShadow: '0 18px 36px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A7AE]">{item.eyebrow}</div>
                  <div className="mt-4 text-[2rem] font-semibold tracking-[-0.06em] text-white sm:text-[2.2rem]">{item.value}</div>
                  <p className="mt-2 text-[15px] font-semibold text-white">{item.label}</p>
                  <p className="mt-3 text-[13px] leading-6 text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function PricingTeaserSection() {
  const [activePricingFamily, setActivePricingFamily] = useState<(typeof pricingFamilies)[number]['id']>('payment-command-center')
  const [openPricingFaq, setOpenPricingFaq] = useState<number | null>(0)

  const activeFamily = pricingFamilies.find((family) => family.id === activePricingFamily) ?? pricingFamilies[0]

  return (
    <section id="pricing" className="relative z-10 scroll-mt-32 px-2 py-24 md:px-3">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="wallet" className="h-4 w-4 text-[#3ba6f7]" />
            <span>Pricing</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            {H.productName} commercials — sandbox first, custom with sales
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            This is the V1 payout workspace commercial model: evaluate in sandbox, then work with Arealis on production pricing. Payments, payroll, and banking SKUs are not listed here.
          </p>
        </Reveal>

        <div className="rounded-[2rem] border border-white/10 p-4 sm:p-5" style={surfaceCardStyle}>
          <div className="flex flex-wrap gap-2">
            {pricingFamilies.map((family) => (
              <button
                key={family.id}
                type="button"
                onClick={() => setActivePricingFamily(family.id)}
                className={`rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all ${
                  activePricingFamily === family.id
                    ? 'bg-[#c6efcf] text-[#09110c] shadow-[0_12px_24px_rgba(198,239,207,0.16)]'
                    : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {family.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpenPricingFaq(0)
                document.getElementById('pricing-faqs')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-[13px] font-semibold text-slate-200 transition-all hover:bg-white/10"
            >
              FAQs
            </button>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[1.7rem] border border-white/10 p-7" style={surfaceCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A7AE]">{activeFamily.eyebrow}</div>
              <div className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-slate-400">{activeFamily.kicker}</div>
              <div className="mt-3 text-[3rem] font-semibold tracking-[-0.06em] text-white md:text-[3.8rem]">
                {activeFamily.metric}
              </div>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">{activeFamily.detail}</p>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-400">{activeFamily.subdetail}</p>

              <div className="mt-8 space-y-4">
                {activeFamily.highlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-3">
                    <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5">
                      <Glyph name="check-circle" className="h-4 w-4 text-[#3ba6f7]" />
                    </div>
                    <p className="text-[15px] leading-7 text-slate-200">{highlight}</p>
                  </div>
                ))}
              </div>

              {activeFamily.footnote ? (
                <p className="mt-6 text-[12px] leading-6 text-slate-500">{activeFamily.footnote}</p>
              ) : null}
            </div>

            <div className="grid gap-4">
              {activeFamily.stats.map(([label, value], index) => (
                <div
                  key={label}
                  className="rounded-[1.5rem] border border-white/10 p-6"
                  style={
                    index === 0
                      ? {
                          ...surfaceCardStyle,
                          background:
                            'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.10), transparent 30%), linear-gradient(180deg, color-mix(in srgb, var(--color-brand-surface-hover) 84%, white 16%) 0%, var(--color-brand-surface) 100%)',
                        }
                      : surfaceCardStyle
                  }
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                  <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{value}</div>
                </div>
              ))}

              <div className="rounded-[1.5rem] border border-white/10 p-6" style={panelCardStyle}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Buying motion</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  Start self-serve when speed matters. Move to Growth or Custom when volume, controls, or rollout depth become part of the buying decision.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-[13px] font-semibold text-black transition hover:bg-zinc-200"
                  >
                    Book a demo
                  </Link>
                  <a
                    href="mailto:Support@zordnet.com?subject=Pricing%20discussion%20for%20ZORD"
                    className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-white/10"
                  >
                    Contact sales
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-12">
          <div className="pointer-events-none absolute inset-0 hidden md:block">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.08),rgba(255,255,255,0))]" />
            <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,166,247,0.12)_0%,rgba(59,166,247,0.03)_42%,transparent_72%)]" />
          </div>

          <div className="mb-8 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Commitment paths</div>
            <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Choose the rollout motion that matches your buying velocity.
            </h3>
            <p className="mx-auto mt-4 max-w-3xl text-[15px] leading-7 text-slate-400 md:text-base">
              Start self-serve when speed matters. Move into Growth or Custom when volume, controls, rollout support, and commercial design become part of the decision.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 md:items-stretch">
          {pricingPlans.map((plan, index) => (
            <div
              key={plan.title}
              className={`relative flex h-full flex-col overflow-hidden rounded-[2rem] border p-8 ${
                plan.featured ? 'border-[#3ba6f7]/50 md:-translate-y-3' : 'border-white/10'
              }`}
              style={{
                ...surfaceCardStyle,
                background:
                  index === 1
                    ? 'radial-gradient(circle at 50% 0%, rgba(59,166,247,0.18), transparent 36%), radial-gradient(circle at 100% 0%, rgba(255,170,72,0.14), transparent 28%), linear-gradient(180deg, rgba(22,24,31,0.98) 0%, rgba(12,14,19,0.99) 100%)'
                    : 'linear-gradient(180deg, rgba(14,16,22,0.98) 0%, rgba(9,11,16,0.99) 100%)',
                boxShadow: plan.featured
                  ? '0 28px 72px rgba(0,0,0,0.42), 0 0 0 1px rgba(59,166,247,0.12), 0 0 40px rgba(59,166,247,0.12), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              {plan.featured && plan.badge ? (
                <div className="absolute inset-x-0 top-0 flex -translate-y-1/2 justify-center">
                  <div className="rounded-full border border-[#ff9b45]/40 bg-[linear-gradient(180deg,#ff8a1e_0%,#ff7400_100%)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1a1108] shadow-[0_10px_30px_rgba(255,128,22,0.32)]">
                    {plan.badge}
                  </div>
                </div>
              ) : null}

              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{plan.subtitle}</div>
              <div className="mt-4 text-[2rem] font-semibold tracking-[-0.05em] text-white">{plan.title}</div>
              <div className="mt-6 text-[2.35rem] font-semibold tracking-[-0.06em] text-white md:text-[2.7rem]">{plan.metric}</div>
              <p className="mt-4 min-h-[5.25rem] text-[15px] leading-7 text-slate-400">{plan.detail}</p>

              {plan.href.startsWith('/') ? (
                <Link
                  href={plan.href}
                  className={`mt-8 inline-flex items-center justify-center rounded-[1.05rem] px-5 py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] transition ${
                    plan.featured
                      ? 'bg-[linear-gradient(180deg,#ff8a1e_0%,#ff7400_100%)] text-[#170d05] shadow-[0_14px_34px_rgba(255,128,22,0.28)] hover:brightness-105'
                      : 'border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
                  }`}
                >
                  {plan.ctaLabel}
                </Link>
              ) : (
                <a
                  href={plan.href}
                  className={`mt-8 inline-flex items-center justify-center rounded-[1.05rem] px-5 py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] transition ${
                    plan.featured
                      ? 'bg-[linear-gradient(180deg,#ff8a1e_0%,#ff7400_100%)] text-[#170d05] shadow-[0_14px_34px_rgba(255,128,22,0.28)] hover:brightness-105'
                      : 'border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
                  }`}
                >
                  {plan.ctaLabel}
                </a>
              )}

              <div className="mt-8 h-px bg-white/6" />

              <div className="mt-7 space-y-4">
                {plan.points.map((point) => (
                  <div key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] ${
                        plan.featured
                          ? 'border-[#ff8a1e]/60 text-[#ff8a1e]'
                          : 'border-white/12 text-slate-500'
                      }`}
                    >
                      ✓
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>

        <div id="pricing-faqs" className="mt-8 rounded-[2rem] border border-white/10 p-6 sm:p-8" style={surfaceCardStyle}>
          <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Pricing FAQs</div>
            <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">Answers before procurement turns into a thread.</h3>
          </div>

          <div className="mt-8 divide-y divide-white/10">
            {pricingFaqs.map((faq, index) => (
              <div key={faq.question} className="py-5">
                <button
                  type="button"
                  onClick={() => setOpenPricingFaq(openPricingFaq === index ? null : index)}
                  className="flex w-full items-center justify-between gap-5 text-left"
                >
                  <span className="text-lg font-semibold tracking-tight text-white">{faq.question}</span>
                  <Glyph
                    name="chevron-down"
                    className={`h-5 w-5 text-slate-400 transition-transform ${openPricingFaq === index ? 'rotate-180' : ''}`}
                  />
                </button>
                {openPricingFaq === index ? (
                  <p className="pt-4 max-w-3xl text-[15px] leading-7 text-slate-400">{faq.answer}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export function TestimonialsSection() {
  return (
    <section className="relative z-10 scroll-mt-32 px-2 py-24 md:px-3" id="customers">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
            <Glyph name="check-circle" className="h-4 w-4 text-[#3ba6f7]" />
            <span>Customers</span>
          </div>
          <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Who evaluates ZORD in live payout environments
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            Buyer lenses — not customer logos or outcome statistics. Teams evaluate ZORD when payout accountability spans operations, finance, engineering, and risk at the same time.
          </p>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2">
          {operatingStories.slice(0, 4).map((persona) => (
            <div key={persona.title} className="rounded-[2rem] border border-white/10 p-8" style={surfaceCardStyle}>
              <div className="text-lg font-semibold tracking-tight text-white">{persona.title}</div>
              <p className="mt-1 text-base text-[#c6efcf]">{persona.role}</p>
              <p className="mt-5 text-lg leading-relaxed text-slate-300">{persona.body}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {persona.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ResourcesSection() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl scroll-mt-32 px-2 py-24 md:px-3" id="resources">
      <Reveal className="mb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
          <Glyph name="book" className="h-4 w-4 text-[#3ba6f7]" />
          <span>Resources</span>
        </div>
        <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Product resources for teams evaluating ZORD
        </h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
          Use these entry points to understand the operating model, review controls, clarify rollout fit, or speak directly with the Arealis team building the product.
        </p>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-2">
        {resourceCards.map((item, index) => (
          <a
            key={item.title}
            href={item.href}
            className="rounded-[1.8rem] border border-white/10 p-8 transition hover:border-white/16 hover:bg-white/[0.03]"
            style={{
              ...surfaceCardStyle,
              background:
                index === 0
                  ? 'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.10), transparent 30%), linear-gradient(180deg, color-mix(in srgb, var(--color-brand-surface-hover) 84%, white 16%) 0%, var(--color-brand-surface) 100%)'
                  : surfaceCardStyle.background,
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.eyebrow}</div>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">{item.title}</h3>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">{item.body}</p>
            <div className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#c6efcf]">
              <span>{item.cta}</span>
              <Glyph name="arrow-up-right" className="h-4 w-4" />
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

export function CompanySection() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl scroll-mt-32 px-2 py-24 md:px-3" id="company">
      <Reveal className="mb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 shadow-[0_10px_20px_rgba(0,0,0,0.12)]">
          <Glyph name="globe" className="h-4 w-4 text-[#3ba6f7]" />
          <span>About Arealis</span>
        </div>
        <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Arealis builds enterprise intelligence that acts
        </h2>
        <p className="mx-auto mt-5 max-w-4xl text-lg leading-relaxed text-slate-400 md:text-xl">
          Arealis is building a distributed intelligent operating fabric where data does not just inform decisions, it executes them. ZORD is one product in that larger system, focused on payout control, financial operations, and proof-ready infrastructure.
        </p>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[2rem] border border-white/10 p-8" style={surfaceCardStyle}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Story and vision</div>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">From AI research to enterprise operating systems</h3>
          <p className="mt-5 text-[16px] leading-8 text-slate-300">
            Arealis started as an AI research effort and evolved into an enterprise intelligence platform designed to bridge fragmented systems, distributed data zones, and autonomous agents that work together across real operating environments.
          </p>
          <p className="mt-4 text-[16px] leading-8 text-slate-400">
            The mission is to make enterprise operations self-optimizing, explainable, and resilient. Rather than building another AI tool, Arealis is building the infrastructure layer on which enterprise intelligence can run natively.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Products</div>
              <div className="mt-3 text-lg font-semibold text-white">ZORD + Gateway</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                ZORD focuses on payout operations and compliance-ready evidence, while Arealis continues building broader enterprise intelligence infrastructure.
              </p>
            </div>
            <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Supported by</div>
              <div className="mt-3 text-lg font-semibold text-white">AWS + Microsoft</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Arealis is backed through AWS Founders Hub and Microsoft for Startups, supporting secure and scalable product infrastructure.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[2rem] border border-white/10 p-8" style={surfaceCardStyle}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Recognitions and milestones</div>
            <div className="mt-6 space-y-4">
              {arealisMilestones.map((item, index) => (
                <div
                  key={item.title}
                  className="rounded-[1.35rem] border border-white/10 p-5"
                  style={
                    index === 0
                      ? {
                          background:
                            'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.10), transparent 34%), linear-gradient(180deg, rgba(31,35,44,0.98) 0%, rgba(14,17,23,0.98) 100%)',
                        }
                      : { background: 'rgba(255,255,255,0.03)' }
                  }
                >
                  <div className="text-base font-semibold text-white">{item.title}</div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 p-8" style={surfaceCardStyle}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Founder note</div>
            <p className="mt-4 text-[16px] leading-8 text-slate-300">
              “At Arealis, we’re building intelligence that does not just analyze data, it acts on it. Our goal is to enable systems that learn, adapt, and operate autonomously while staying transparent and secure.”
            </p>
            <div className="mt-5 text-sm font-semibold text-white">Abhishek J. Shirsath, Founder & CEO</div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[2rem] border border-white/10 p-8" style={surfaceCardStyle}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">The minds behind Arealis</div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {arealisTeam.map((member) => (
            <div key={member.name} className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-lg font-semibold tracking-tight text-white">{member.name}</div>
              <div className="mt-1 text-[13px] font-medium text-[#c6efcf]">{member.role}</div>
              <p className="mt-4 text-sm leading-7 text-slate-400">{member.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="relative z-10 overflow-hidden scroll-mt-32 px-2 pt-32 md:px-3" id="book">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 px-8 py-16 text-center backdrop-blur-sm md:px-14" style={surfaceCardStyle}>
          <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full blur-[110px]" style={{ backgroundColor: 'rgba(59, 166, 247, 0.12)' }} />
          <div className="relative z-10 mx-auto max-w-3xl">
            <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl md:leading-tight">
              {landingHomeCopy.finalCta.title}
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate-400 md:text-xl">
              {landingHomeCopy.finalCta.body}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="mailto:Support@zordnet.com?subject=Book%20Demo%20for%20Zord"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3464ff] px-10 py-4 text-lg font-semibold text-white shadow-[0_20px_40px_rgba(52,100,255,0.24)] transition-all hover:bg-[#2451ff]"
              >
                Book Demo
                <Glyph name="arrow-right" className="h-5 w-5" />
              </a>
              <Link
                href="/final-landing/how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-10 py-4 text-lg font-semibold text-slate-100 transition-all hover:bg-white/10"
              >
                See how it works
                <Glyph name="arrow-up-right" className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer id="developers" className="relative z-10 scroll-mt-32 px-2 pb-12 pt-16 md:px-3">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 border-t border-white/10 pt-10 md:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <ZordLogo size="md" variant="dark" className="!w-auto max-w-[9rem]" />
            <p className="mt-6 max-w-[320px] text-[14px] leading-7 text-slate-400">
              {landingHomeCopy.footer.body}
            </p>
            <p className="mt-4 text-[14px] text-slate-400">Contact: Support@zordnet.com</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{column.title}</div>
              <div className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <div key={link} className="cursor-pointer text-[13px] text-slate-400 transition hover:text-white hover:underline">
                    {link}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <div className="text-[12px] text-slate-500">© 2026 Arealis</div>
          <div className="flex gap-6 text-[12px] text-slate-500">
            <a href="#" className="transition-colors hover:text-white">Privacy</a>
            <a href="#" className="transition-colors hover:text-white">Terms</a>
            <a href="#" className="transition-colors hover:text-white">System Status</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPageFinalClient() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden text-slate-50 selection:bg-blue-500/30 selection:text-white"
      style={{
        background: 'linear-gradient(180deg, var(--color-brand-base) 0%, var(--color-brand-surface) 100%)',
        fontFamily: '"Sora", "Plus Jakarta Sans", "DM Sans", "Inter", system-ui, sans-serif',
      }}
    >
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, var(--color-brand-base) 0%, var(--color-brand-surface) 100%)' }} />
        <div className="absolute inset-x-0 top-0 h-[72rem]" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-brand-surface-hover) 94%, white 6%) 0%, rgba(18,23,31,0.95) 16%, rgba(12,14,18,0.78) 38%, rgba(10,10,12,0) 100%)' }} />
        <div className="absolute inset-0 zord-grid-soft opacity-[0.16]" />
        <div className="absolute inset-0 bg-noise opacity-[0.18]" />
        <div className="absolute left-1/2 top-[-8%] h-[54rem] w-[72rem] -translate-x-1/2 rounded-full blur-[190px]" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-brand-blue) 22%, transparent) 0%, rgba(30, 41, 59, 0.14) 32%, rgba(10,10,12,0) 74%)' }} />
        <div className="absolute left-1/2 top-[22%] h-[32rem] w-[42rem] -translate-x-1/2 rounded-full blur-[150px]" style={{ background: 'radial-gradient(circle, rgba(255, 255, 255, 0.06) 0%, color-mix(in srgb, var(--color-brand-blue) 10%, transparent) 28%, rgba(10,10,12,0) 72%)' }} />
        <div className="absolute left-1/2 bottom-[-8%] h-[26rem] w-[46rem] -translate-x-1/2 rounded-full blur-[170px]" style={{ background: 'radial-gradient(circle, rgba(71,85,105,0.16) 0%, rgba(10,10,12,0) 70%)' }} />
        <div className="absolute inset-y-0 left-[10%] hidden w-px bg-gradient-to-b from-transparent via-white/8 to-transparent lg:block" />
        <div className="absolute inset-y-0 right-[10%] hidden w-px bg-gradient-to-b from-transparent via-white/8 to-transparent lg:block" />
        <div className="absolute left-0 top-[24%] h-px w-[120%] origin-left -rotate-[8deg] bg-gradient-to-r from-transparent via-white/8 to-transparent" />
        <div className="absolute left-0 top-[58%] h-px w-[120%] origin-left -rotate-[8deg] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
      </div>

      <div className="relative z-10">
        <FinalLandingNavbar syncToHash />
        <FinalLandingAssistantButton />
        <Hero />
        <ProductHeroVisualSection />
        <ProductExperience />
        <HowItWorksSection />
        <CapabilitiesSection />
        <InfrastructureSection />
        <FinalCTA />
        <SiteFooter />
      </div>
    </div>
  )
}
