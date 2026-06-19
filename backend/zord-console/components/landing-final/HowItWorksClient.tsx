'use client'

import Link from 'next/link'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { FinalLandingNavbar } from '@/components/landing-final/FinalLandingNavbar'

const dockItems = ['Intent intake', 'Connector watch', 'Live tracking', 'Evidence Pack']

const metricItems = [
  { label: 'Stages', value: '4', unit: 'steps' },
  { label: 'Signals', value: 'Multi', unit: 'source' },
  { label: 'Proof', value: 'Export', unit: 'ready' },
  { label: 'Preview', value: 'Sandbox', unit: '' },
]

const stageDetails = [
  {
    id: '01',
    nav: 'Intent',
    title: 'Create the payout intent',
    body:
      'A payout request enters Zord with beneficiary, amount, business rules, and proof requirements. The platform validates instruction details, risk flags, and workspace context before downstream tracking begins.',
    bullets: [
      'Validate amount, workspace, beneficiary, and compliance constraints',
      'Attach business context so later teams understand why the payout exists',
      'Normalize the request into one shared record before connector signals attach',
    ],
    metrics: [
      { label: 'Contract checks', value: 'Configured' },
      { label: 'Risk rules', value: 'Workspace' },
      { label: 'Prep state', value: 'Validated' },
    ],
    panel: 'intent' as const,
  },
  {
    id: '02',
    nav: 'Connectors',
    title: 'Observe connector and rail posture',
    body:
      'Zord surfaces connector performance, confirmation trust, and rail posture from live workspace data. Operations can see which paths need review before failures become queue pressure.',
    bullets: [
      'Compare primary and fallback connectors for each payout window',
      'Watch failure signals, slow responses, and confirmation trust in one connector view',
      'Record posture changes so support and finance can explain what shifted',
    ],
    metrics: [
      { label: 'Connector view', value: 'Live' },
      { label: 'Leakage signals', value: 'Surfaced' },
      { label: 'Review path', value: 'Guided' },
    ],
    panel: 'routing' as const,
  },
  {
    id: '03',
    nav: 'Tracking',
    title: 'Track every payout state',
    body:
      'Once sent to the bank path, Zord keeps the provider acknowledgement, bank confirmation, settlement progress, and exception signals in one timeline. Operations teams see exactly where money is waiting.',
    bullets: [
      'Merge provider and bank events into one chronological payout story',
      'Surface lagging stages before finance starts chasing support teams',
      'Highlight which failures are provider-side, bank-side, or data-side',
    ],
    metrics: [
      { label: 'States captured', value: 'End-to-end' },
      { label: 'Sync model', value: 'Workspace' },
      { label: 'Exception view', value: 'Live' },
    ],
    panel: 'tracking' as const,
  },
  {
    id: '04',
    nav: 'Proof',
    title: 'Confirm delivery and export Evidence Packs',
    body:
      'Zord confirms whether money actually reached and assembles the evidence pack required by finance, compliance, legal, or support. You don’t need to reopen five systems to defend one payout.',
    bullets: [
      'Match confirmation signals, provider timeline, and statement evidence together',
      'Keep Evidence Packs ready for disputes, audits, and merchant questions',
      'Export one artifact instead of rebuilding the trail manually',
    ],
    metrics: [
      { label: 'Proof sources', value: 'Linked' },
      { label: 'Pack readiness', value: 'Workspace' },
      { label: 'Export path', value: 'One click' },
    ],
    panel: 'proof' as const,
  },
]

const teamCards = [
  {
    title: 'Operations',
    body: 'See where payouts are stuck, which connector is degrading, and which queue needs attention right now.',
    tags: ['Live queue', 'Connector lag', 'Exception review'],
  },
  {
    title: 'Finance',
    body: 'Understand whether money moved, reconcile the final state, and keep defensible Evidence Packs for every transfer.',
    tags: ['Finality', 'Evidence Packs', 'Audit trail'],
  },
  {
    title: 'Engineering',
    body: 'Connect payment sources while keeping one shared payout record across providers and banks.',
    tags: ['Integrations', 'Confirmations', 'Shared record'],
  },
]

const revealCard = {
  hidden: { opacity: 0, y: 26, scale: 0.985 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.62,
      delay: index * 0.06,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
}

const hoverLift = {
  y: -8,
  scale: 1.01,
  transition: { duration: 0.25, ease: 'easeOut' },
}

function ArrowRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m10.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10">
      <div className="absolute h-full w-full animate-ping rounded-full bg-indigo-500/20" />
      <div className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.9)]" />
    </div>
  )
}

function ConnectorChart() {
  const lanes = [
    { label: 'Cashfree · IMPS', score: 'Stable', width: '82%', gradient: 'from-indigo-300 via-violet-400 to-cyan-400' },
    { label: 'Razorpay · Failover', score: 'Watch', width: '68%', gradient: 'from-sky-300 via-blue-400 to-indigo-500' },
    { label: 'Yes Bank UPI', score: 'Review', width: '48%', gradient: 'from-amber-300 via-amber-400 to-orange-500' },
  ]

  return (
    <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
      <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
        <span>Connector posture</span>
        <span>Product preview</span>
      </div>

      <div className="space-y-4">
        {lanes.map((lane, index) => (
          <div key={lane.label}>
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-300">
              <span>{lane.label}</span>
              <span className="font-mono text-slate-400">{lane.score}</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${lane.gradient}`}
                initial={{ width: 0 }}
                whileInView={{ width: lane.width }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.85, delay: index * 0.08 }}
              />
              {index === 0 ? (
                <motion.div
                  className="absolute top-1/2 h-3 w-3 rounded-full border border-white/80 bg-white shadow-[0_0_16px_rgba(255,255,255,0.8)]"
                  animate={{ x: ['0%', '560%', '0%'] }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ left: '8%', translateY: '-50%' }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {['Primary path', 'Fallback ready', 'Leakage watch'].map((chip) => (
          <div key={chip} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-center text-[10px] uppercase tracking-[0.18em] text-slate-400">
            {chip}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProofChart() {
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const progress = 0.82

  return (
    <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
      <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
        <span>Evidence Pack completeness</span>
        <span>Preview</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
            <motion.circle
              cx="60"
              cy="60"
              r={radius}
              stroke="url(#proof-ring)"
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              whileInView={{ strokeDashoffset: circumference * (1 - progress) }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
            <defs>
              <linearGradient id="proof-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="55%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[24px] font-light tracking-tight text-white">Ready</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Preview</div>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {[
            ['Webhook receipt', 'Linked'],
            ['Provider trail', 'Linked'],
            ['Bank statement', 'Pending'],
          ].map(([label, value], index) => (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-300">
                <span>{label}</span>
                <span className="font-mono text-slate-400">{value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-300 via-indigo-400 to-cyan-400"
                  initial={{ width: 0 }}
                  whileInView={{ width: value }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.8, delay: index * 0.08 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StagePanel({ panel }: { panel: (typeof stageDetails)[number]['panel'] }) {
  if (panel === 'intent') {
    return (
      <div className="space-y-4">
        <motion.div
          className="rounded-2xl border border-white/8 bg-black/30 p-4"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -4, scale: 1.01 }}
        >
          <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
            <span>Payment instruction</span>
            <span>Validated</span>
          </div>
          <div className="space-y-2 font-mono text-[12px] text-slate-300">
            <div>{'beneficiary_id: seller_4821'}</div>
            <div>{'amount: sample_value'}</div>
            <div>{'mode: workspace_preview'}</div>
            <div>{'proof: required'}</div>
          </div>
        </motion.div>
        <div className="flex flex-wrap gap-2">
          {['AML cleared', 'Policy matched', 'Proof required'].map((chip, index) => (
            <motion.span
              key={chip}
              className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-[11px] text-indigo-200"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
              whileHover={{ y: -2, scale: 1.03 }}
            >
              {chip}
            </motion.span>
          ))}
        </div>
      </div>
    )
  }

  if (panel === 'routing') {
    return (
      <div className="space-y-3">
        <ConnectorChart />
        {[
          ['Cashfree', 'Stable', 'Primary IMPS'],
          ['Razorpay', 'Watch', 'Failover lane'],
          ['Yes Bank UPI', 'Review', 'Overflow lane'],
        ].map(([name, success, cost], index) => (
          <motion.div
            key={name}
            className={`rounded-2xl border p-4 ${
              index === 0 ? 'border-indigo-400/25 bg-indigo-500/10' : 'border-white/8 bg-white/[0.03]'
            }`}
            initial={{ opacity: 0, x: 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.42, delay: index * 0.05 }}
            whileHover={{ y: -3, scale: 1.01 }}
          >
            <div className="flex items-center justify-between text-sm text-white">
              <span>{name}</span>
              <span className="font-mono text-slate-300">{success}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-500">
              <span>{index === 0 ? 'Selected path' : 'Fallback path'}</span>
              <span>{cost}</span>
            </div>
          </motion.div>
        ))}
      </div>
    )
  }

  if (panel === 'tracking') {
    return (
      <div className="space-y-4">
        {[
          ['Dispatched', '09:42:12', true],
          ['Provider acknowledged', '09:42:18', true],
          ['Bank confirmation', '09:42:31', true],
          ['Settlement update', '09:43:02', false],
        ].map(([label, time, active], index) => (
          <motion.div
            key={String(label)}
            className="flex gap-3"
            initial={{ opacity: 0, x: 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.42, delay: index * 0.06 }}
            whileHover={{ x: 4 }}
          >
            <div className="flex flex-col items-center">
              <div className={`h-3.5 w-3.5 rounded-full ${active ? 'bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.7)]' : 'bg-white/10'}`} />
              {index < 3 ? <div className="mt-1 h-10 w-px bg-white/10" /> : null}
            </div>
            <div className="pb-4">
              <div className="text-sm text-white">{label}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">{time}</div>
            </div>
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ProofChart />
      {[
        ['Provider timeline', 'Included'],
        ['Bank statement match', 'Included'],
        ['Webhook receipt', 'Included'],
        ['Operator action log', 'Included'],
      ].map(([label, status], index) => (
        <motion.div
          key={label}
          className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.4, delay: index * 0.05 }}
          whileHover={{ y: -2, scale: 1.01 }}
        >
          <span className="text-sm text-slate-200">{label}</span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-300">
            {status}
          </span>
        </motion.div>
      ))}
      <motion.div
        className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100"
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.42, delay: 0.16 }}
        whileHover={{ y: -2, scale: 1.01 }}
      >
        Export Evidence Pack in one click for audit, dispute, or merchant communication.
      </motion.div>
    </div>
  )
}

export default function HowItWorksClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const journeyRef = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: journeyRef,
    offset: ['start 15%', 'end 85%'],
  })
  const timelineScale = useTransform(scrollYProgress, [0, 1], [0, 1])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrame = 0
    let width = 0
    let height = 0

    type Stream = {
      x: number
      y: number
      length: number
      speed: number
      opacity: number
      thickness: number
      hue: number
    }

    let streams: Stream[] = []

    const init = () => {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const streamCount = width < 768 ? 40 : 100
      streams = Array.from({ length: streamCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 80 + 20,
        speed: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.45 + 0.08,
        thickness: Math.random() * 1.2 + 0.4,
        hue: 228 + Math.random() * 32,
      }))
    }

    const draw = () => {
      ctx.fillStyle = 'rgba(3, 7, 18, 0.16)'
      ctx.fillRect(0, 0, width, height)

      streams.forEach((stream) => {
        const gradient = ctx.createLinearGradient(stream.x, stream.y, stream.x, stream.y - stream.length)
        gradient.addColorStop(0, `hsla(${stream.hue}, 85%, 72%, ${stream.opacity})`)
        gradient.addColorStop(1, `hsla(${stream.hue}, 85%, 72%, 0)`)

        ctx.beginPath()
        ctx.moveTo(stream.x, stream.y)
        ctx.lineTo(stream.x, stream.y - stream.length)
        ctx.strokeStyle = gradient
        ctx.lineWidth = stream.thickness
        ctx.lineCap = 'round'
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(stream.x, stream.y, stream.thickness * 1.15, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${stream.hue}, 90%, 88%, ${stream.opacity + 0.28})`
        ctx.fill()

        stream.y += stream.speed
        if (stream.y - stream.length > height) {
          stream.y = -10
          stream.x = Math.random() * width
        }
      })

      animationFrame = window.requestAnimationFrame(draw)
    }

    const onResize = () => init()

    init()
    draw()
    window.addEventListener('resize', onResize)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div
      className="relative h-screen overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth [scrollbar-gutter:stable] bg-[#030712] font-sans text-slate-200 antialiased selection:bg-indigo-500 selection:text-white"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      <FinalLandingNavbar active="Product" />
      <FinalLandingAssistantButton />
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-60" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,#030712_100%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.03] [background-image:repeating-linear-gradient(45deg,#ffffff_0px,#ffffff_1px,transparent_1px,transparent_16px)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] snap-start [scroll-snap-stop:always] items-center justify-center overflow-hidden p-4 pt-28 sm:p-8 sm:pt-36 lg:p-10 lg:pt-40">
        <div className="relative mx-auto w-full max-w-[1480px] overflow-hidden rounded-[3rem] border border-white/50 bg-[#f6f9fc] shadow-[0_40px_120px_rgba(15,23,42,0.18)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,122,89,0.34),transparent_28%),radial-gradient(circle_at_66%_42%,rgba(255,105,180,0.26),transparent_26%),radial-gradient(circle_at_24%_0%,rgba(106,90,205,0.28),transparent_34%),radial-gradient(circle_at_92%_82%,rgba(0,191,255,0.22),transparent_28%)]" />
          <div className="pointer-events-none absolute left-0 top-1/4 h-px w-[120%] origin-left -rotate-[7deg] bg-gradient-to-r from-transparent via-black/5 to-transparent" />
          <div className="pointer-events-none absolute left-0 top-2/4 h-px w-[120%] origin-left -rotate-[7deg] bg-gradient-to-r from-transparent via-black/5 to-transparent" />
          <div className="relative mx-auto flex w-full max-w-7xl flex-col px-6 pb-14 pt-16 sm:px-10 lg:px-14 lg:pb-20 lg:pt-20">
            <motion.header
              className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-600/10 px-3.5 py-1.5 text-[14px] font-light text-indigo-600">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-600 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
                  </span>
                  <span>How payouts move through Zord</span>
                </div>
                <h1 className="text-4xl font-normal tracking-[-0.05em] text-slate-800 sm:text-5xl lg:text-[4.15rem] lg:leading-[0.95]">
                  One payout flow.
                  <br />
                  Full visibility from intent to proof.
                </h1>
              </div>

              <div className="flex items-center gap-4 rounded-full border border-white/70 bg-white/70 py-2 pl-2 pr-6 shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                <PulseIcon />
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500">System status</span>
                  <span className="text-xs font-light tracking-wide text-indigo-600">Nominal payout flow</span>
                </div>
              </div>
            </motion.header>

            <motion.nav
              className="relative mb-10 max-w-max"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
            >
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/70 bg-white/72 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                {dockItems.map((item, index) => {
                  const active = index === 1
                  return (
                    <div
                      key={item}
                      className={`rounded-full px-5 py-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-indigo-600 font-medium text-white shadow-[0_12px_28px_rgba(79,70,229,0.28)]'
                          : 'font-light text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      {item}
                    </div>
                  )
                })}
              </div>
            </motion.nav>

            <section className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
            <motion.div
              className="relative flex flex-col items-start justify-center lg:col-span-5 lg:pr-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12 }}
            >
              <div className="pointer-events-none absolute -left-20 top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-indigo-600/8 blur-[80px]" />

              <div className="mb-6 inline-block rounded-full border border-indigo-200 bg-white/75 px-3 py-1 shadow-sm">
                <span className="text-xs font-light uppercase tracking-[0.2em] text-indigo-600">Payout infrastructure</span>
              </div>

              <h2 className="mb-7 text-4xl font-normal leading-[1.02] tracking-[-0.05em] text-slate-800 sm:text-5xl lg:text-[4.3rem]">
                Observe.
                <br />
                <span className="text-slate-600">Track.</span>
                <br />
                Confirm. Prove.
              </h2>

              <p className="mb-9 max-w-xl text-[16px] font-light leading-8 text-slate-500 sm:text-[17px]">
                Zord receives your payout intent, surfaces connector and bank posture, watches every downstream state change,
                and confirms whether money actually reached. Finance, operations, and engineering teams see the same truth from one workspace.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
                  className="group relative overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 px-7 py-3.5 text-[15px] font-medium text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-indigo-500/50"
                  style={{
                    boxShadow:
                      '0 15px 33px -12px rgba(99, 102, 241, 0.9), inset 0 4px 6.3px rgba(165, 180, 252, 0.6), inset 0 -5px 6.3px rgba(67, 56, 202, 0.8)',
                  }}
                >
                  <div className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0" />
                  <span className="relative flex items-center gap-2.5">
                    Book Demo
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </a>

                <Link
                  href="/"
                  className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-[15px] font-medium text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gray-50"
                >
                  Back to landing
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-16 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
                {metricItems.map((item, index) => (
                  <motion.div
                    key={item.label}
                    className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm"
                    custom={index}
                    variants={revealCard}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.35 }}
                    whileHover={hoverLift}
                  >
                    <span className={`text-[10px] font-medium uppercase tracking-widest ${item.label === 'State' ? 'text-indigo-600' : 'text-slate-500'}`}>
                      {item.label}
                    </span>
                    <span className={`mt-1 block text-xl font-light tracking-tight ${item.label === 'State' ? 'text-indigo-600' : 'text-slate-800'}`}>
                      {item.value}
                      {item.unit ? <span className={`ml-1 text-xs ${item.label === 'State' ? 'text-indigo-400/60' : 'text-slate-500'}`}>{item.unit}</span> : null}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="relative flex aspect-square max-h-[600px] w-full items-center justify-center lg:col-span-7"
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.18 }}
            >
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/12 blur-[100px]" />

              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[3rem] border border-slate-800 bg-slate-900 shadow-2xl">
                <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-white/5" />
                <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/5" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.34),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_28%)]" />

                <svg viewBox="0 0 800 800" className="h-full w-full max-w-[800px] p-8 drop-shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                  <defs>
                    <linearGradient id="zord-edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(99,102,241,0.8)" />
                      <stop offset="100%" stopColor="rgba(99,102,241,0.12)" />
                    </linearGradient>
                    <linearGradient id="zord-surface-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
                    </linearGradient>
                  </defs>

                  <g transform="translate(400, 400)">
                    <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
                      <path d="M-300,0 L0,150 L300,0 L0,-150 Z" fill="url(#zord-surface-gradient)" />
                      <path d="M-150,75 L150,-75" />
                      <path d="M-150,-75 L150,75" />
                      <path d="M-225,37.5 L75,-112.5" />
                      <path d="M-75,112.5 L225,-37.5" />
                      <path d="M-225,-37.5 L75,112.5" />
                      <path d="M-75,-112.5 L225,37.5" />
                    </g>

                    <g transform="translate(0, -90)" stroke="rgba(99,102,241,0.22)" strokeWidth="1.5">
                      <path d="M-210,0 L0,105 L210,0 L0,-105 Z" fill="rgba(3,7,18,0.5)" />
                      <path d="M-105,52.5 L105,-52.5 M-105,-52.5 L105,52.5" />
                      <path d="M0,-105 L0,105 M-210,0 L210,0" strokeDasharray="4,4" />

                      <g stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="2,4">
                        <line x1="0" y1="0" x2="0" y2="105" />
                        <line x1="-110" y1="50" x2="-160" y2="122" />
                        <line x1="110" y1="50" x2="160" y2="122" />
                        <line x1="-110" y1="-50" x2="-160" y2="-26" />
                        <line x1="110" y1="-50" x2="160" y2="-26" />
                      </g>
                    </g>

                    <g transform="translate(0,-220)">
                      <path d="M0,-60 L80,-20 L0,20 L-80,-20 Z" fill="rgba(99,102,241,0.15)" stroke="rgba(99,102,241,0.6)" strokeWidth="1.5" />
                      <path d="M-80,-20 L0,20 L0,100 L-80,60 Z" fill="rgba(99,102,241,0.05)" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" />
                      <path d="M0,20 L80,-20 L80,60 L0,100 Z" fill="rgba(99,102,241,0.1)" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" />
                      <path d="M0,-60 L80,-20 L80,60" stroke="white" strokeWidth="1" fill="none" opacity="0.5" />
                      <line x1="0" y1="100" x2="0" y2="220" stroke="url(#zord-edge-gradient)" strokeWidth="2" />
                      <circle cx="0" cy="20" r="4" fill="#fff" />
                      <circle cx="0" cy="-60" r="3" fill="#818cf8" />
                      <circle cx="-80" cy="-20" r="3" fill="#818cf8" />
                      <circle cx="80" cy="-20" r="3" fill="#818cf8" />
                    </g>

                    {[
                      { x: -180, y: -50, label: 'Intent' },
                      { x: 0, y: -210, label: 'Route' },
                      { x: 160, y: -30, label: 'Provider' },
                      { x: -40, y: 145, label: 'Bank' },
                      { x: 200, y: 82, label: 'Proof' },
                    ].map((node, index) => (
                      <g key={node.label}>
                        <motion.circle
                          cx={node.x}
                          cy={node.y}
                          r={index === 1 ? 7 : 5}
                          fill={index === 1 ? '#a5b4fc' : '#ffffff'}
                          animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] }}
                          transition={{ duration: 2.8 + index * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <text x={node.x + 12} y={node.y - 10} fill="rgba(255,255,255,0.72)" fontSize="18" fontWeight="300">
                          {node.label}
                        </text>
                      </g>
                    ))}
                  </g>
                </svg>

                <div className="absolute bottom-6 left-6 rounded-[1.5rem] border border-white/10 bg-black/35 px-5 py-4 backdrop-blur-xl">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">proof status</div>
                  <div className="mt-2 text-[26px] font-light tracking-tight text-white">97.8%</div>
                  <div className="mt-1 text-sm text-slate-400">evidence pack ready</div>
                </div>
              </div>
            </motion.div>
            </section>
          </div>
        </div>
      </main>

      <div className="relative z-10 -mt-20 bg-transparent pt-0 lg:-mt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_0%,rgba(255,105,180,0.10),transparent_28%),radial-gradient(circle_at_78%_10%,rgba(99,102,241,0.13),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(56,189,248,0.08),transparent_36%)]" />
        <motion.section
          ref={journeyRef}
          className="relative mx-auto flex min-h-screen w-full max-w-[1380px] snap-start [scroll-snap-stop:always] items-start px-6 pb-20 pt-0"
          initial={{ opacity: 0, y: 48, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-full overflow-hidden rounded-[3rem] border border-white/65 bg-slate-50/95 px-6 py-10 shadow-[0_42px_130px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:px-8 lg:px-10 lg:py-12">
            <motion.div
              className="mb-12 max-w-3xl"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6 }}
            >
              <p className="mb-3 text-sm uppercase tracking-[0.24em] text-indigo-600">Operational flow</p>
              <h3 className="text-3xl font-light tracking-tight text-slate-900 sm:text-4xl md:text-[3rem]">
                Every stage is visible, attributable, and designed for action
              </h3>
              <p className="mt-4 max-w-2xl text-base font-light leading-7 text-slate-500">
                Scroll through the journey below to see how Zord converts a raw payout request into a fully tracked, confirmed, and defensible outcome.
              </p>
            </motion.div>

            <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="h-fit lg:sticky lg:top-16">
                <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                  <div className="absolute bottom-8 left-[31px] top-8 w-px bg-slate-200" />
                  <motion.div
                    className="absolute left-[31px] top-8 w-px origin-top bg-gradient-to-b from-indigo-400 via-violet-500 to-cyan-400"
                    style={{ height: 'calc(100% - 4rem)', scaleY: timelineScale }}
                  />

                  <div className="space-y-8">
                    {stageDetails.map((stage, index) => (
                      <motion.div
                        key={stage.id}
                        className="relative pl-10"
                        custom={index}
                        variants={revealCard}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.5 }}
                        whileHover={{ x: 4 }}
                      >
                        <div className="absolute left-[18px] top-1.5 h-7 w-7 -translate-x-1/2 rounded-full border border-indigo-200 bg-indigo-50 shadow-[0_0_0_6px_rgba(255,255,255,0.9)]" />
                        <div className="text-[10px] uppercase tracking-[0.22em] text-indigo-600">{stage.id} · {stage.nav}</div>
                        <div className="mt-2 text-base font-light text-slate-900">{stage.title}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">
                          {index === 0 ? 'Request intake' : index === 1 ? 'Live decisioning' : index === 2 ? 'State unification' : 'Proof generation'}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative space-y-6 lg:space-y-0 lg:pb-28">
                {stageDetails.map((stage, index) => (
                  <motion.article
                    key={stage.id}
                    className={`relative grid gap-7 overflow-hidden rounded-[2.15rem] border border-slate-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:sticky lg:top-24 lg:grid-cols-[minmax(0,1.35fr)_minmax(430px,0.95fr)] lg:p-8 ${
                      index > 0 ? 'lg:-mt-24' : ''
                    }`}
                    style={{ zIndex: 20 + index }}
                    initial={{ opacity: 0, y: 34, scale: 0.985 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.24 }}
                    transition={{ duration: 0.65, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -10, scale: 1.008, transition: { duration: 0.24 } }}
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_60%)]" />
                    <div className="relative z-10">
                      <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-indigo-600">
                        Stage {stage.id}
                      </div>
                      <h4 className="mt-5 text-3xl font-light tracking-tight text-slate-900">{stage.title}</h4>
                      <p className="mt-4 max-w-2xl text-base font-light leading-7 text-slate-500">{stage.body}</p>

                      <ul className="mt-6 space-y-3">
                        {stage.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-3 text-sm leading-7 text-slate-700">
                            <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-7 grid gap-3 sm:grid-cols-3">
                        {stage.metrics.map((metric, metricIndex) => (
                          <motion.div
                            key={metric.label}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5"
                            custom={metricIndex}
                            variants={revealCard}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, amount: 0.5 }}
                            whileHover={{ y: -4, scale: 1.02 }}
                          >
                            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{metric.label}</div>
                            <div className="mt-2 text-[22px] font-light tracking-tight text-slate-900">{metric.value}</div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="relative z-10 rounded-[1.85rem] border border-slate-200/20 bg-[linear-gradient(135deg,#0b1220_0%,#111827_45%,#1e1b4b_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(15,23,42,0.25)]">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Live surface</div>
                        <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">
                          {stage.nav}
                        </div>
                      </div>
                      <StagePanel panel={stage.panel} />
                    </div>
                  </motion.article>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        <section className="relative mx-auto flex min-h-screen w-full max-w-[1380px] snap-start [scroll-snap-stop:always] items-center px-6 pb-20 pt-10">
          <div className="w-full overflow-hidden rounded-[3rem] bg-[#050B14] px-8 py-14 shadow-[0_40px_110px_rgba(2,6,23,0.38)] md:px-10">
            <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-full max-w-6xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(67,56,202,0.16),transparent_60%)] opacity-80" />
            <motion.div
              className="relative z-10 mb-10 max-w-3xl"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6 }}
            >
              <p className="mb-3 text-sm uppercase tracking-[0.24em] text-indigo-300">Shared visibility</p>
              <h3 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
                Different teams, one payout truth
              </h3>
              <p className="mt-4 text-base font-light leading-7 text-slate-400">
                Zord keeps operations, finance, and engineering aligned without forcing each team to build its own version of payout state.
              </p>
            </motion.div>

            <div className="relative z-10 grid gap-6 lg:grid-cols-3">
              {teamCards.map((card, index) => (
                <motion.article
                  key={card.title}
                  className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-7 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-xl"
                  custom={index}
                  variants={revealCard}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.2 }}
                  whileHover={{ y: -8, scale: 1.015, transition: { duration: 0.24 } }}
                >
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-sm font-medium text-indigo-200">
                    {index + 1}
                  </div>
                  <h4 className="text-2xl font-light tracking-tight text-white">{card.title}</h4>
                  <p className="mt-4 text-sm leading-7 text-slate-400">{card.body}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative mx-auto flex min-h-[88vh] w-full max-w-[1380px] snap-start [scroll-snap-stop:always] items-center px-6 pb-28 pt-10">
          <motion.div
            className="w-full overflow-hidden rounded-[2.75rem] border border-slate-200 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_35%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.10)] md:p-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="mb-3 text-sm uppercase tracking-[0.24em] text-indigo-600">From request to proof</p>
                <h3 className="text-3xl font-light tracking-tight text-slate-900 sm:text-4xl">
                  This is what a payout operating system should feel like
                </h3>
                <p className="mt-4 text-base font-light leading-7 text-slate-500">
                  Zord gives your teams a single operating layer for connector visibility, payout confirmation, matching, and Evidence Pack export without the usual reconciliation scramble.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Back to landing
                </Link>
                <a
                  href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-[0_16px_32px_-10px_rgba(79,70,229,0.55)] transition-transform hover:-translate-y-0.5"
                >
                  Book Demo
                  <ArrowRightIcon className="h-4 w-4" />
                </a>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  )
}
