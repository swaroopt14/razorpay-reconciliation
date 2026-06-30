'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { LandingHeroTopBar } from '@/components/landing-final/LandingHeroTopBar'
import { LandingHeroSection } from '@/components/landing-final/LandingHeroSection'
import { LandingScrollRevealSection } from '@/components/landing-final/LandingScrollRevealSection'
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
        <LandingHeroTopBar />
        <FinalLandingAssistantButton />
        <LandingHeroSection />
        <LandingScrollRevealSection />
        <HowItWorksSection />
        <CapabilitiesSection />
        <InfrastructureSection />
        <FinalCTA />
        <SiteFooter />
      </div>
    </div>
  )
}
