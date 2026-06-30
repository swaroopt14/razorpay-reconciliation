'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ScrollText, Send, ShieldCheck } from 'lucide-react'
import { AuthSplitLayout } from './AuthSplitLayout'
import { authInputClass, authLabelClass, authPrimaryButtonClass } from './authUiTokens'

type StepId = 'use-case' | 'company' | 'volume' | 'contact'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'use-case', label: 'Use case' },
  { id: 'company', label: 'Company' },
  { id: 'volume', label: 'Volume' },
  { id: 'contact', label: 'Contact' },
]

const USE_CASES = [
  {
    id: 'payouts',
    title: 'Payouts & disbursement',
    desc: 'Route vendor, payroll and refund payouts across rails with policy control.',
    icon: Send,
  },
  {
    id: 'reconciliation',
    title: 'Reconciliation & settlement',
    desc: 'Match settlements, catch leakage, and auto-close the loop.',
    icon: ScrollText,
  },
  {
    id: 'evidence',
    title: 'Compliance & audit evidence',
    desc: 'Generate defensible proof packs for every payment.',
    icon: ShieldCheck,
  },
] as const

const BUSINESS_SECTORS = [
  'Fintech / NBFC',
  'Bank',
  'Lending / Credit',
  'E-commerce & marketplace',
  'Payroll / HR tech',
  'SaaS',
  'Logistics & mobility',
  'Insurance',
  'Gaming',
  'Other',
]

const COMPANY_TYPES = [
  'Private Limited',
  'Public Limited',
  'LLP',
  'Partnership',
  'Sole proprietorship',
  'Other',
]

const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–1,000', '1,000+']

const MONTHLY_VOLUMES = [
  'Under ₹10 lakh',
  '₹10 lakh – ₹1 crore',
  '₹1 – 10 crore',
  '₹10 – 100 crore',
  '₹100 crore+',
]

const PAYMENT_PURPOSES = [
  'Vendor & supplier payments',
  'Payroll & salaries',
  'Customer refunds',
  'Marketplace settlements',
  'Loan disbursement',
  'Mixed / multiple',
  'Other',
]

const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Singapore', 'United Arab Emirates', 'Other']

const PHONE_CODES = ['+91', '+1', '+44', '+65', '+971']

type LeadForm = {
  useCases: string[]
  companyName: string
  businessSector: string
  companyType: string
  country: string
  companySize: string
  monthlyVolume: string
  paymentPurpose: string
  currentStack: string
  goal: string
  fullName: string
  workEmail: string
  phoneCountryCode: string
  phone: string
  role: string
}

const INITIAL_FORM: LeadForm = {
  useCases: [],
  companyName: '',
  businessSector: '',
  companyType: '',
  country: 'India',
  companySize: '',
  monthlyVolume: '',
  paymentPurpose: '',
  currentStack: '',
  goal: '',
  fullName: '',
  workEmail: '',
  phoneCountryCode: '+91',
  phone: '',
  role: '',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STEP_COPY: Record<StepId, { eyebrow: string; title: string; subtitle: string }> = {
  'use-case': {
    eyebrow: 'Book a demo',
    title: 'What do you want to run on Zord?',
    subtitle: 'Pick everything that applies — it helps us tailor the walkthrough.',
  },
  company: {
    eyebrow: 'Book a demo · Company',
    title: 'Tell us about your company',
    subtitle: 'A few basics about your business.',
  },
  volume: {
    eyebrow: 'Book a demo · Volume',
    title: 'Your payment volume & goals',
    subtitle: 'Helps us size the right setup before we talk.',
  },
  contact: {
    eyebrow: 'Book a demo · Contact',
    title: 'How can we reach you?',
    subtitle: 'Our team will call to understand your needs and set up access.',
  },
}

function Stepper({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'todo'
        return (
          <li key={step.id} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-1.5 w-full rounded-full transition-colors ${
                state === 'todo' ? 'bg-slate-200' : 'bg-[#2B55E8]'
              }`}
            />
            <span
              className={`text-[11px] font-semibold ${
                state === 'active' ? 'text-[#2B55E8]' : state === 'done' ? 'text-slate-700' : 'text-slate-400'
              }`}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={authLabelClass}>{label}</span>
      {children}
    </label>
  )
}

export function DemoLeadFlow() {
  const [step, setStep] = useState<StepId>('use-case')
  const [form, setForm] = useState<LeadForm>(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const currentIndex = STEPS.findIndex((s) => s.id === step)
  const copy = STEP_COPY[step]

  function update<K extends keyof LeadForm>(key: K, value: LeadForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleUseCase(id: string) {
    setForm((prev) => ({
      ...prev,
      useCases: prev.useCases.includes(id)
        ? prev.useCases.filter((u) => u !== id)
        : [...prev.useCases, id],
    }))
  }

  const stepValid = useMemo(() => {
    switch (step) {
      case 'use-case':
        return form.useCases.length > 0
      case 'company':
        return Boolean(form.companyName.trim() && form.businessSector && form.country)
      case 'volume':
        return Boolean(form.monthlyVolume)
      case 'contact':
        return Boolean(form.fullName.trim() && EMAIL_RE.test(form.workEmail.trim()) && form.phone.trim())
      default:
        return false
    }
  }, [step, form])

  function goBack() {
    setError(null)
    if (currentIndex > 0) setStep(STEPS[currentIndex - 1].id)
  }

  async function goNext() {
    setError(null)
    if (!stepValid) {
      setError('Please complete the highlighted fields to continue.')
      return
    }
    if (step !== 'contact') {
      setStep(STEPS[currentIndex + 1].id)
      return
    }
    // Final step — submit the lead.
    setLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message ?? 'Could not send your request. Try again.')
        setLoading(false)
        return
      }
      setDone(true)
      setLoading(false)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthSplitLayout
        variant="demo"
        eyebrow="Request received"
        title="Thanks — we'll be in touch"
        subtitle={`Our team will reach out to ${form.fullName.split(' ')[0] || 'you'} within one business day to set up your workspace and access.`}
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="text-[13px] leading-relaxed text-emerald-900">
              <p className="font-semibold">What happens next</p>
              <ul className="mt-2 space-y-1.5 text-emerald-800">
                <li>1. A specialist reviews what you want to run on Zord.</li>
                <li>2. We call to understand your payment flows and volume.</li>
                <li>3. You get a provisioned workspace and an access link.</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          Already have access?{' '}
          <Link href="/signin" className="font-semibold text-[#2B55E8] hover:underline">
            Sign in
          </Link>
        </p>
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout variant="demo" eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle}>
      <Stepper current={step} />

      {step === 'use-case' ? (
        <div className="space-y-3">
          {USE_CASES.map((uc) => {
            const Icon = uc.icon
            const selected = form.useCases.includes(uc.id)
            return (
              <button
                key={uc.id}
                type="button"
                onClick={() => toggleUseCase(uc.id)}
                aria-pressed={selected}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                  selected
                    ? 'border-[#2B55E8] bg-[#2B55E8]/[0.04] ring-1 ring-[#2B55E8]/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-[#2B55E8] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-slate-900">{uc.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">{uc.desc}</span>
                </span>
                <span
                  className={`ml-auto mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    selected ? 'border-[#2B55E8] bg-[#2B55E8] text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {step === 'company' ? (
        <div className="space-y-4">
          <Field label="Company / legal name">
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => update('companyName', e.target.value)}
              className={authInputClass}
              placeholder="e.g. Acme Payments Pvt Ltd"
              autoComplete="organization"
            />
          </Field>
          <Field label="Business sector">
            <select
              value={form.businessSector}
              onChange={(e) => update('businessSector', e.target.value)}
              className={authInputClass}
            >
              <option value="">Select a sector</option>
              {BUSINESS_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company type">
              <select
                value={form.companyType}
                onChange={(e) => update('companyType', e.target.value)}
                className={authInputClass}
              >
                <option value="">Select</option>
                {COMPANY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Company size">
              <select
                value={form.companySize}
                onChange={(e) => update('companySize', e.target.value)}
                className={authInputClass}
              >
                <option value="">Select</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} people
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Country">
            <select
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              className={authInputClass}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {step === 'volume' ? (
        <div className="space-y-4">
          <Field label="Monthly payout volume">
            <select
              value={form.monthlyVolume}
              onChange={(e) => update('monthlyVolume', e.target.value)}
              className={authInputClass}
            >
              <option value="">Select a range</option>
              {MONTHLY_VOLUMES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Primary payment purpose">
            <select
              value={form.paymentPurpose}
              onChange={(e) => update('paymentPurpose', e.target.value)}
              className={authInputClass}
            >
              <option value="">Select a purpose</option>
              {PAYMENT_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How do you pay today? (optional)">
            <input
              type="text"
              value={form.currentStack}
              onChange={(e) => update('currentStack', e.target.value)}
              className={authInputClass}
              placeholder="e.g. RazorpayX, bank portals, in-house scripts"
            />
          </Field>
          <Field label="What do you most want to improve? (optional)">
            <textarea
              value={form.goal}
              onChange={(e) => update('goal', e.target.value)}
              rows={3}
              className={`${authInputClass} resize-none`}
              placeholder="e.g. reconciliation takes days, no audit trail for disputes…"
            />
          </Field>
        </div>
      ) : null}

      {step === 'contact' ? (
        <div className="space-y-4">
          <Field label="Full name">
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              className={authInputClass}
              placeholder="e.g. Alex Patel"
              autoComplete="name"
            />
          </Field>
          <Field label="Work email">
            <input
              type="email"
              value={form.workEmail}
              onChange={(e) => update('workEmail', e.target.value)}
              className={authInputClass}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </Field>
          <Field label="Phone number">
            <div className="mt-1.5 flex gap-2">
              <select
                value={form.phoneCountryCode}
                onChange={(e) => update('phoneCountryCode', e.target.value)}
                className="w-[88px] rounded-lg border border-[#D6E4F0] bg-white px-2.5 py-2.5 text-[14px] text-slate-900 outline-none transition focus:border-[#2B55E8] focus:ring-2 focus:ring-[#2B55E8]/15"
                aria-label="Country code"
              >
                {PHONE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value.replace(/[^\d]/g, ''))}
                className={`${authInputClass} mt-0 flex-1`}
                placeholder="Phone number"
                autoComplete="tel"
                inputMode="numeric"
              />
            </div>
          </Field>
          <Field label="Your role (optional)">
            <input
              type="text"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              className={authInputClass}
              placeholder="e.g. Head of Finance, Payments Lead"
            />
          </Field>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        {currentIndex > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={goNext}
          disabled={loading}
          className={authPrimaryButtonClass}
        >
          {loading ? 'Sending…' : step === 'contact' ? 'Request a demo' : 'Continue'}
        </button>
      </div>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        Already have access?{' '}
        <Link href="/signin" className="font-semibold text-[#2B55E8] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthSplitLayout>
  )
}
