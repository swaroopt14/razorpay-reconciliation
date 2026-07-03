'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { LandingHeroTopBar } from '@/components/landing-final/LandingHeroTopBar'
import { LandingHeroSection } from '@/components/landing-final/LandingHeroSection'
import { LandingCapabilitiesSection } from '@/components/landing-final/LandingCapabilitiesSection'
import { LandingFinalCtaSection } from '@/components/landing-final/LandingFinalCtaSection'
import { LandingHowItWorksSection } from '@/components/landing-final/LandingHowItWorksSection'
import { LandingProductFooter } from '@/components/landing-final/LandingProductFooter'
import { LandingScrollRevealSection } from '@/components/landing-final/LandingScrollRevealSection'
import { LandingSignalStageSection } from '@/components/landing-final/LandingSignalStageSection'
import { LIGHT_PRODUCT_SECTION } from '@/components/landing-final/landingSectionLayout'
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
        <div className={LIGHT_PRODUCT_SECTION}>
          <LandingScrollRevealSection />
          <LandingSignalStageSection />
          <LandingHowItWorksSection />
          <LandingCapabilitiesSection />
          <LandingFinalCtaSection />
          <LandingProductFooter />
        </div>
      </div>
    </div>
  )
}
