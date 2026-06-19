'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { ZordLogo } from '@/components/ZordLogo'

type TopNavMenuItem = {
  label: string
  href: string
  note: string
}

type TopNavItem = {
  label: string
  href: string
  menu?: readonly TopNavMenuItem[]
}

type PricingCard = {
  title: string
  value: string
  note: string
  accent?: boolean
}

type PricingFamily = {
  id: string
  label: string
  eyebrow: string
  title: string
  description: string
  detail: string
  pricingLabel: string
  pricingNote: string
  bullets: readonly string[]
  cards: readonly PricingCard[]
  footnote?: string
}

type EngagementPlan = {
  title: string
  eyebrow: string
  metric: string
  description: string
  features: readonly string[]
  cta: string
  href: string
  featured?: boolean
}

const topNav: readonly TopNavItem[] = [
  {
    label: 'Product',
    href: '#product-families',
    menu: [
      { label: 'Payment Command Center', href: '#payment-command-center', note: 'Workspace, Evidence Packs, and connector views.' },
      { label: 'Sandbox', href: '#plans', note: 'Evaluate before production commercials.' },
      { label: 'Enterprise', href: '#sales', note: 'Custom rollouts, security review, and account coverage.' },
    ],
  },
  {
    label: 'Solutions',
    href: '#plans',
    menu: [
      { label: 'Sandbox', href: '#plans', note: 'Evaluate the operating model first.' },
      { label: 'Growth', href: '#plans', note: 'Production workspace with support.' },
      { label: 'Enterprise', href: '#sales', note: 'Custom commercials and rollout help.' },
    ],
  },
  { label: 'Pricing', href: '#top' },
  { label: 'Customers', href: '#trust' },
  {
    label: 'Resources',
    href: '#support',
    menu: [
      { label: 'How it works', href: '/final-landing/how-it-works', note: 'Operating model walkthrough.' },
      { label: 'Support', href: '#support', note: 'Talk to sales or request implementation guidance.' },
      { label: 'FAQs', href: '#faqs', note: 'Commercials, sandbox, and go-live answers.' },
    ],
  },
  {
    label: 'Company',
    href: '#footer',
    menu: [
      { label: 'About Zord', href: '/final-landing/company', note: 'Platform, team, and company overview.' },
      { label: 'Security', href: '#support', note: 'Review support, controls, and implementation help.' },
      { label: 'Contact', href: '#sales', note: 'Talk to commercial, product, or onboarding teams.' },
    ],
  },
] as const

const pricingFamilies: readonly PricingFamily[] = [
  {
    id: 'payment-command-center',
    label: 'Payment Command Center',
    eyebrow: 'Payment Command Center',
    title: 'Commercial clarity for the payout operations workspace',
    description:
      'ZORD is priced as a payout control product — sandbox to evaluate, then custom commercials for production rollout. This page does not list Payments, Payroll, or Banking SKUs.',
    detail:
      'Commercials are shaped around workspace depth, connector coverage, Evidence Pack workflows, and rollout support.',
    pricingLabel: 'Contact sales',
    pricingNote: 'Custom / volume-led commercials',
    bullets: [
      'Payment Command Center, Value at Risk, and Connector Performance views.',
      'Evidence Packs for finance close, disputes, and audit questions.',
      'Sandbox preview before production commercials.',
      'Implementation and security review support for enterprise rollouts.',
    ],
    cards: [
      {
        title: 'Commercial model',
        value: 'Custom',
        note: 'Volume-led pricing for production workspace access',
        accent: true,
      },
      {
        title: 'Entry path',
        value: 'Sandbox',
        note: 'Evaluate the operating model before buying',
      },
      {
        title: 'Best for',
        value: 'Ops + Finance',
        note: 'Teams carrying payout accountability across functions',
      },
    ],
  },
] as const

const engagementPlans: readonly EngagementPlan[] = [
  {
    title: 'Sandbox',
    eyebrow: 'Best for evaluation and pilot teams',
    metric: 'No commitment',
    description:
      'Explore the payout workspace, connector views, and Evidence Pack flows with illustrative data before production rollout.',
    features: ['Workspace preview', 'Product walkthrough', 'Technical fit review', 'Standard onboarding docs'],
    cta: 'Start in sandbox',
    href: '/signin/tenant',
  },
  {
    title: 'Growth',
    eyebrow: 'Best for teams moving into production',
    metric: 'Annual agreement',
    description:
      'Unlock production workspace access, implementation support, and a commercial review cadence once payout volume becomes an operating concern.',
    features: ['Production workspace', 'Implementation support', 'Commercial review cadence', 'Priority onboarding'],
    cta: 'Talk to sales',
    href: '#sales',
    featured: true,
  },
  {
    title: 'Enterprise',
    eyebrow: 'Best for regulated and high-volume programs',
    metric: 'Custom',
    description:
      'Flexible commercials for security review, multi-team rollout, custom Evidence Pack workflows, and dedicated account coverage.',
    features: ['Volume-led pricing', 'Security review support', 'White-glove rollout', 'Dedicated account coverage'],
    cta: 'Request enterprise pricing',
    href: '#sales',
  },
] as const

const comparisonRows = [
  { label: 'Commercial model', starter: 'Sandbox evaluation', growth: 'Annual agreement', enterprise: 'Custom bands' },
  { label: 'Workspace access', starter: 'Preview data', growth: 'Production workspace', enterprise: 'Production + custom workflows' },
  { label: 'Evidence Packs', starter: 'Preview flows', growth: 'Production exports', enterprise: 'Custom export design' },
  { label: 'Implementation support', starter: 'Docs + demo', growth: 'Priority onboarding', enterprise: 'White-glove rollout' },
  { label: 'Security review support', starter: 'Self-serve docs', growth: 'Guided responses', enterprise: 'Dedicated review help' },
  { label: 'Account coverage', starter: 'Standard', growth: 'Commercial cadence', enterprise: 'Dedicated account team' },
] as const

const faqs = [
  {
    question: 'How is Payment Command Center priced?',
    answer:
      'Pricing is custom and based on workspace usage, connector coverage, rollout depth, and support needs. Teams start in sandbox and move to commercials with sales — there is no self-serve checkout rate on this product.',
  },
  {
    question: 'When should I talk to sales?',
    answer:
      'Talk to sales when you want a guided demo, production rollout planning, security review, or a commercial discussion after sandbox evaluation.',
  },
  {
    question: 'Can I test the platform before committing?',
    answer:
      'Yes. Start in sandbox to validate the operating model, workspace fit, and Evidence Pack workflows before choosing Growth or Enterprise plans.',
  },
  {
    question: 'Does this page include Payments, Payroll, or Banking pricing?',
    answer:
      'No. This page covers Payment Command Center only. Payments acceptance, payroll subscriptions, and banking products are not part of the V1 payout console commercial model.',
  },
  {
    question: 'Can multiple teams share one workspace rollout?',
    answer:
      'Yes. Ops, finance, engineering, and risk can evaluate and adopt against the same workspace record instead of separate dashboards and manual proof rebuilds.',
  },
] as const

const supportCards = [
  {
    id: 'sales',
    eyebrow: 'Talk to sales',
    title: 'Choose the right commercial path with a human in the loop',
    copy:
      'Discuss sandbox fit, production rollout, security review, enterprise commercials, or implementation support for Payment Command Center.',
    cta: 'Contact sales',
    href: 'mailto:hello@arelais.com?subject=Zord%20pricing%20conversation',
  },
  {
    id: 'docs',
    eyebrow: 'For developers',
    title: 'Bring engineering into the pricing decision early',
    copy:
      'Review docs, implementation notes, integration expectations, and rollout support before you lock in commercials for production.',
    cta: 'View docs',
    href: '/console/login',
  },
] as const

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Payment Command Center', href: '#payment-command-center' },
      { label: 'Sandbox', href: '#plans' },
      { label: 'How it works', href: '/final-landing/how-it-works' },
      { label: 'Final landing pricing', href: '/final-landing/pricing' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Quickstart', href: '#support' },
      { label: 'API docs', href: '#support' },
      { label: 'Sandbox', href: '/console/login' },
      { label: 'Support', href: '#support' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Pricing', href: '#top' },
      { label: 'FAQs', href: '#faqs' },
      { label: 'Sales contact', href: '#sales' },
      { label: 'Implementation help', href: '#support' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Zord', href: '/' },
      { label: 'Customers', href: '#trust' },
      { label: 'Book demo', href: 'mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord' },
      { label: 'Contact', href: 'mailto:hello@arelais.com' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '#' },
      { label: 'Privacy', href: '#' },
      { label: 'Responsible disclosure', href: '#' },
      { label: 'Status', href: '#' },
    ],
  },
] as const

const trustLabels = ['Marketplaces', 'NBFCs', 'PSPs', 'Treasury teams', 'Finance ops', 'Payout platforms']

const navShellStyle = {
  background: 'linear-gradient(180deg, rgba(17,20,21,0.92) 0%, rgba(9,11,12,0.97) 100%)',
  boxShadow: '0 24px 70px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)',
}

const navTrackStyle = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 100%)',
  boxShadow: '0 14px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const cardStyle = {
  background: 'linear-gradient(180deg, rgba(20,24,34,0.9) 0%, rgba(10,12,18,0.98) 100%)',
  boxShadow: '0 28px 70px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const accentCardStyle = {
  background:
    'radial-gradient(circle at top right, rgba(99,102,241,0.18), transparent 34%), linear-gradient(180deg, rgba(27,31,45,0.96) 0%, rgba(12,15,21,0.98) 100%)',
  boxShadow: '0 30px 80px rgba(17,24,39,0.32), inset 0 1px 0 rgba(255,255,255,0.08)',
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 shadow-[0_10px_24px_rgba(0,0,0,0.15)]">
      {children}
    </div>
  )
}

function CheckIcon({ accent = false }: { accent?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-none ${accent ? 'text-[#c6efcf]' : 'text-[#818cf8]'}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ArrowUpRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: readonly { label: string; href: string }[]
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">{title}</div>
      <div className="mt-4 space-y-2.5">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="block text-[13px] text-white/50 transition hover:text-white"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function PricingPage() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeFamily, setActiveFamily] = useState(pricingFamilies[0].id)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  useEffect(() => {
    if (!mobileOpen) {
      return
    }

    const closeMenu = () => setMobileOpen(false)
    window.addEventListener('hashchange', closeMenu)
    return () => window.removeEventListener('hashchange', closeMenu)
  }, [mobileOpen])

  const handleFamilySelect = (id: string) => {
    setActiveFamily(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main
      id="top"
      className="min-h-screen overflow-x-hidden bg-[#05070a] text-white"
      style={{
        fontFamily: "'Roobert', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(198,239,207,0.12),transparent_22%),linear-gradient(180deg,#06080b_0%,#05070a_100%)]" />
        <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:120px_120px]" />
      </div>

      <nav className="fixed inset-x-0 top-6 z-50 px-4 sm:px-6">
        <div
          className="relative mx-auto flex w-full max-w-[1280px] items-center justify-between overflow-hidden rounded-[36px] border border-white/10 px-4 py-4 backdrop-blur-[22px]"
          style={navShellStyle}
        >
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.08),transparent_28%)]" />

          <Link href="/" className="relative z-10 shrink-0" aria-label="Zord home">
            <ZordLogo size="lg" variant="dark" className="w-[170px] sm:w-[210px]" />
          </Link>

          <div className="relative z-10 hidden flex-1 items-center justify-center gap-1 xl:flex">
            {topNav.map((item) => {
              const hasMenu = Boolean(item.menu?.length)
              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => hasMenu && setOpenMenu(item.label)}
                  onMouseLeave={() => hasMenu && setOpenMenu((current) => (current === item.label ? null : current))}
                >
                  {hasMenu ? (
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === item.label ? null : item.label))}
                      className={`inline-flex items-center gap-2 rounded-[20px] px-4 py-3 text-[15px] font-medium tracking-[-0.03em] transition ${
                        item.label === 'Pricing' ? 'text-white' : 'text-slate-300/85 hover:text-white'
                      }`}
                      style={item.label === 'Pricing' ? navTrackStyle : undefined}
                      aria-expanded={openMenu === item.label}
                    >
                      <span>{item.label}</span>
                      <ChevronIcon open={openMenu === item.label} />
                    </button>
                  ) : (
                    <a
                      href={item.href}
                      className={`inline-flex items-center rounded-[20px] px-4 py-3 text-[15px] font-medium tracking-[-0.03em] transition ${
                        item.label === 'Pricing' ? 'text-white' : 'text-slate-300/85 hover:text-white'
                      }`}
                      style={item.label === 'Pricing' ? navTrackStyle : undefined}
                    >
                      {item.label}
                    </a>
                  )}

                  {hasMenu && openMenu === item.label ? (
                    <div
                      className="absolute left-1/2 top-[calc(100%+12px)] z-30 w-[320px] -translate-x-1/2 rounded-[24px] border border-white/10 p-3 shadow-[0_22px_60px_rgba(0,0,0,0.32)] backdrop-blur-[22px]"
                      style={navShellStyle}
                    >
                      <div className="space-y-2">
                        {item.menu?.map((entry) => (
                          <a
                            key={entry.label}
                            href={entry.href}
                            onClick={() => setOpenMenu(null)}
                            className="block rounded-[18px] border border-transparent bg-white/[0.03] px-4 py-3 transition hover:border-white/10 hover:bg-white/[0.06]"
                          >
                            <div className="text-[14px] font-semibold tracking-[-0.02em] text-white">{entry.label}</div>
                            <div className="mt-1 text-[12px] leading-5 text-slate-400">{entry.note}</div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="relative z-10 ml-auto flex items-center gap-3">
            <Link href="/console/login" className="hidden text-[15px] font-medium text-slate-300/80 transition hover:text-white lg:inline-flex">
              Sign in
            </Link>

            <a
              href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
              className="hidden h-12 items-center rounded-[18px] bg-[#c6efcf] px-5 text-[15px] font-semibold text-[#09110c] shadow-[0_16px_34px_rgba(198,239,207,0.16)] transition hover:bg-[#d7f5dd] md:flex"
            >
              Book Demo
            </a>

            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 text-white xl:hidden"
              style={navTrackStyle}
              onClick={() => setMobileOpen((current) => !current)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="mx-auto mt-3 max-w-[1280px] xl:hidden"
            >
              <div className="rounded-[28px] border border-white/10 p-4 backdrop-blur-[22px]" style={navShellStyle}>
                <div className="space-y-3">
                  {topNav.map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                      <a
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-between gap-4 text-[15px] font-semibold tracking-[-0.02em] text-white"
                      >
                        <span>{item.label}</span>
                        <ArrowUpRightIcon className="h-4 w-4 text-slate-400" />
                      </a>
                      {item.menu?.length ? (
                        <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                          {item.menu.map((entry) => (
                            <a
                              key={entry.label}
                              href={entry.href}
                              onClick={() => setMobileOpen(false)}
                              className="block rounded-[16px] px-3 py-2 transition hover:bg-white/[0.05]"
                            >
                              <div className="text-[13px] font-semibold text-slate-200">{entry.label}</div>
                              <div className="mt-1 text-[12px] leading-5 text-slate-400">{entry.note}</div>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <Link
                      href="/console/login"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-[14px] font-semibold text-white"
                    >
                      Sign in
                    </Link>
                    <a
                      href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
                      className="rounded-[18px] bg-[#c6efcf] px-4 py-3 text-center text-[14px] font-semibold text-[#09110c]"
                    >
                      Book Demo
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </nav>

      <div className="relative z-10 pb-24 pt-[150px]">
        <section className="px-5 pb-14 pt-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-end">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <SectionTag>Pricing</SectionTag>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl lg:text-[4.5rem] lg:leading-[0.95]">
                Payment Command Center pricing — sandbox first, custom with sales.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300/82 sm:text-xl">
                Evaluate the payout workspace in sandbox, then work with Arealis on production commercials. Payments, payroll, and banking SKUs are not listed on this page.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/console/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition hover:bg-zinc-200"
                >
                  Sign up
                  <ArrowUpRightIcon className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:hello@arelais.com?subject=Zord%20pricing%20discussion"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-[15px] font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  Contact sales
                </a>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {['Audit logs included', 'Role-based controls', 'Priority onboarding'].map((badge) => (
                  <div
                    key={badge}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-200/90"
                  >
                    {badge}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="rounded-[34px] border border-white/10 p-5 sm:p-6"
              style={cardStyle}
            >
              <div className="rounded-[28px] border border-white/10 p-5 sm:p-6" style={accentCardStyle}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300/80">View pricing of</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {pricingFamilies.map((family) => (
                    <button
                      key={family.id}
                      type="button"
                      onClick={() => handleFamilySelect(family.id)}
                      className={`rounded-[20px] border px-4 py-4 text-left transition ${
                        activeFamily === family.id
                          ? 'border-[#818cf8]/60 bg-[#818cf8]/14 text-white'
                          : 'border-white/8 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="text-[13px] font-semibold tracking-[-0.02em]">{family.label}</div>
                      <div className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em]">{family.pricingLabel}</div>
                      <div className="mt-1 text-[12px] leading-5 text-slate-400">{family.pricingNote}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Commercials</div>
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Flexible</div>
                  <div className="mt-2 text-[13px] leading-6 text-slate-400">Pay-as-you-go, committed, and enterprise models.</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Support</div>
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Priority</div>
                  <div className="mt-2 text-[13px] leading-6 text-slate-400">Onboarding, reporting, and security review support.</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Scope</div>
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Bundled</div>
                  <div className="mt-2 text-[13px] leading-6 text-slate-400">Sandbox, growth, and enterprise paths on one payout product.</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-5 pb-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="sticky top-[112px] z-30 overflow-x-auto rounded-full border border-white/10 px-3 py-3 backdrop-blur-[18px]" style={navShellStyle}>
              <div className="flex min-w-max items-center gap-2">
                {pricingFamilies.map((family) => (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => handleFamilySelect(family.id)}
                    className={`rounded-full px-5 py-3 text-[14px] font-semibold transition ${
                      activeFamily === family.id
                        ? 'bg-[#c6efcf] text-[#09110c] shadow-[0_12px_30px_rgba(198,239,207,0.18)]'
                        : 'bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    {family.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setOpenFaq(0)
                    document.getElementById('faqs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="rounded-full bg-white/[0.04] px-5 py-3 text-[14px] font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  FAQs
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="px-5 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[30px] border border-white/10 px-6 py-7 sm:px-8" style={cardStyle}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Buyer lenses</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white md:text-3xl">
                  Built for teams carrying payout accountability across operations, finance, and engineering
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {trustLabels.map((label) => (
                  <div
                    key={label}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200/90"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="product-families" className="px-5 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-10">
            {pricingFamilies.map((family, index) => (
              <motion.section
                key={family.id}
                id={family.id}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.24 }}
                transition={{ duration: 0.55, delay: index * 0.05 }}
                className="rounded-[34px] border border-white/10 p-6 sm:p-8 lg:p-10"
                style={cardStyle}
              >
                <div className="grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)] lg:items-start">
                  <div>
                    <SectionTag>{family.eyebrow}</SectionTag>
                    <h3 className="mt-6 text-3xl font-semibold tracking-[-0.05em] text-white md:text-[2.6rem] md:leading-[1.02]">
                      {family.title}
                    </h3>
                    <p className="mt-5 text-lg leading-8 text-slate-300/80">{family.description}</p>
                    <p className="mt-4 text-[15px] leading-7 text-slate-400">{family.detail}</p>

                    <div className="mt-8 space-y-4">
                      {family.bullets.map((bullet, bulletIndex) => (
                        <div key={bullet} className="flex items-start gap-3">
                          <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                            <CheckIcon accent={bulletIndex === 0} />
                          </div>
                          <p className="text-[15px] leading-7 text-slate-200/90">{bullet}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                      <Link
                        href="/console/login"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-semibold text-black transition hover:bg-zinc-200"
                      >
                        Sign up
                      </Link>
                      <a
                        href="mailto:hello@arelais.com?subject=Talk%20to%20sales%20about%20Zord%20pricing"
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-3.5 text-[14px] font-semibold text-white transition hover:bg-white/[0.08]"
                      >
                        Talk to sales
                      </a>
                    </div>

                    {family.footnote ? (
                      <p className="mt-5 text-[12px] leading-6 text-slate-500">{family.footnote}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {family.cards.map((card, cardIndex) => (
                      <div
                        key={card.title}
                        className={`rounded-[28px] border p-6 ${
                          cardIndex === 0 ? 'sm:col-span-2' : ''
                        }`}
                        style={card.accent ? accentCardStyle : cardStyle}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.title}</div>
                        <div className="mt-4 text-[2.4rem] font-semibold tracking-[-0.05em] text-white md:text-[2.85rem]">
                          {card.value}
                        </div>
                        <p className="mt-3 max-w-[28rem] text-[14px] leading-7 text-slate-300/80">{card.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.section>
            ))}
          </div>
        </section>

        <section id="plans" className="px-5 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <SectionTag>Commercial models</SectionTag>
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                Choose the plan structure that matches your stage
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-400">
                Inspired by the clarity of the best fintech pricing pages: one self-serve path, one committed path, and one enterprise path with room for security, support, and commercial negotiation.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {engagementPlans.map((plan) => (
                <div
                  key={plan.title}
                  className="rounded-[30px] border p-7"
                  style={plan.featured ? accentCardStyle : cardStyle}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{plan.eyebrow}</div>
                      <h3 className="mt-4 text-[1.85rem] font-semibold tracking-[-0.04em] text-white">{plan.title}</h3>
                    </div>
                    {plan.featured ? (
                      <div className="rounded-full bg-[#c6efcf] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#09110c]">
                        Recommended
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-8 text-[2.4rem] font-semibold tracking-[-0.05em] text-white">{plan.metric}</div>
                  <p className="mt-4 text-[15px] leading-7 text-slate-300/78">{plan.description}</p>

                  <div className="mt-8 space-y-4">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                          <CheckIcon accent={plan.featured} />
                        </div>
                        <p className="text-[14px] leading-7 text-slate-200/88">{feature}</p>
                      </div>
                    ))}
                  </div>

                  <a
                    href={plan.href}
                    className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3.5 text-[14px] font-semibold transition ${
                      plan.featured
                        ? 'bg-[#c6efcf] text-[#09110c] hover:bg-[#d7f5dd]'
                        : 'border border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {plan.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[34px] border border-white/10 p-6 sm:p-8 lg:p-10" style={cardStyle}>
            <div className="max-w-3xl">
              <SectionTag>Plan comparison</SectionTag>
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                Compare the commercial shape before you talk contracts
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-400">
                Keep this simple: self-serve when you want speed, committed pricing when volume begins to matter, and custom rollout when the business needs more support and controls.
              </p>
            </div>

            <div className="mt-10 overflow-x-auto">
              <table className="min-w-[760px] w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Category</th>
                    <th className="pb-5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Starter</th>
                    <th className="pb-5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Growth</th>
                    <th className="pb-5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <td className="py-5 pr-6 text-[15px] font-medium text-white">{row.label}</td>
                      <td className="py-5 pr-6 text-[14px] leading-6 text-slate-300/78">{row.starter}</td>
                      <td className="py-5 pr-6 text-[14px] leading-6 text-slate-300/78">{row.growth}</td>
                      <td className="py-5 text-[14px] leading-6 text-slate-300/78">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="support" className="px-5 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
            {supportCards.map((card, index) => (
              <div
                key={card.id}
                id={card.id}
                className="rounded-[32px] border p-8"
                style={index === 0 ? accentCardStyle : cardStyle}
              >
                <SectionTag>{card.eyebrow}</SectionTag>
                <h2 className="mt-6 text-3xl font-semibold tracking-[-0.05em] text-white md:text-[2.45rem]">
                  {card.title}
                </h2>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300/78">{card.copy}</p>
                <a
                  href={card.href}
                  className={`mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-semibold transition ${
                    index === 0
                      ? 'bg-[#c6efcf] text-[#09110c] hover:bg-[#d7f5dd]'
                      : 'border border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {card.cta}
                  <ArrowUpRightIcon className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </section>

        <section id="faqs" className="px-5 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-[34px] border border-white/10 p-6 sm:p-8 lg:p-10" style={cardStyle}>
            <div className="text-center">
              <SectionTag>FAQs</SectionTag>
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                Get answers to the commercial questions buyers actually ask
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">
                Billing, bundling, testing, custom pricing, and rollout questions live here. If you need a sharper answer, the sales team picks it up from this page.
              </p>
            </div>

            <div className="mt-12 divide-y divide-white/10">
              {faqs.map((faq, index) => (
                <div key={faq.question} className="py-5">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="flex w-full items-center justify-between gap-6 text-left"
                    aria-expanded={openFaq === index}
                  >
                    <span className="text-[18px] font-semibold tracking-[-0.03em] text-white">{faq.question}</span>
                    <ChevronIcon open={openFaq === index} />
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === index ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <p className="pt-4 text-[15px] leading-7 text-slate-400">{faq.answer}</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[34px] border border-white/10 p-8 sm:p-10 lg:p-12" style={accentCardStyle}>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <SectionTag>Ready to move</SectionTag>
                <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                  Put pricing, rollout, and support into one clean conversation
                </h2>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300/82">
                  Start in sandbox, talk through production commercials, or plan an enterprise rollout with security review and implementation support.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row lg:flex-col">
                <Link
                  href="/console/login"
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition hover:bg-zinc-200"
                >
                  Sign up
                </Link>
                <a
                  href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-7 py-4 text-[15px] font-semibold text-white transition hover:bg-white/[0.1]"
                >
                  Book demo
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer id="footer" className="relative z-10 border-t border-white/10 px-5 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div>
            <ZordLogo size="sm" variant="dark" className="items-center text-white" />
            <p className="mt-6 max-w-[320px] text-[13px] leading-7 text-white/50">
              Zord brings pricing, rollout, and operational clarity together for fintech teams that want payments, banking workflows, payroll, and credit coverage under one commercial surface.
            </p>
            <p className="mt-5 text-[12px] text-white/35">© 2026 Arealis Zord. All rights reserved.</p>
          </div>

          {footerColumns.map((column) => (
            <FooterColumn key={column.title} title={column.title} links={column.links} />
          ))}
        </div>
      </footer>
    </main>
  )
}
