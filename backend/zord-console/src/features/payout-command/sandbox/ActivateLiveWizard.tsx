'use client'

import { useEffect, useMemo, useState } from 'react'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { EntityLogo } from '../entity-logo'
import { Glyph } from '../shared'

/**
 * ActivateLiveWizard — 5-step modal that takes a sandbox account and submits it
 * for live activation. Every step validates required fields before advancing.
 *
 * Flow:
 *   step1 (business)  → step2 (KYC)        → step3 (PSPs)
 *   → step4 (plan)    → step5 (review)     → submitting → submitted
 *
 * On submit: sets `liveActivationStatus = 'in_review'` and closes after a 2s
 * success card. The mode toggle's "Live" option remains locked until the status
 * is flipped to `'active'` (which would happen server-side after KYC review).
 */

type Step = 1 | 2 | 3 | 4 | 5

const STEP_LABELS: Record<Step, string> = {
  1: 'Business',
  2: 'KYC',
  3: 'Connectors',
  4: 'Plan',
  5: 'Review',
}

// ─── Step 1 — Business info ────────────────────────────────────────────────────

type BusinessForm = {
  legalName: string
  businessType: 'pvt_ltd' | 'llp' | 'public' | 'sole_prop' | ''
  taxId: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

const EMPTY_BUSINESS: BusinessForm = {
  legalName: '',
  businessType: '',
  taxId: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
}

function isBusinessValid(b: BusinessForm) {
  return (
    b.legalName.trim().length > 1 &&
    b.businessType !== '' &&
    /^[A-Z0-9]{6,}$/i.test(b.taxId.replace(/\s+/g, '')) &&
    b.addressLine1.trim().length > 3 &&
    b.city.trim().length > 0 &&
    b.state.trim().length > 0 &&
    /^\d{4,8}$/.test(b.postalCode.trim())
  )
}

// ─── Step 2 — KYC docs ─────────────────────────────────────────────────────────

type KycSlot = 'incorporation' | 'gst' | 'director_id'
type KycFiles = Record<KycSlot, { name: string; size: number } | null>
const EMPTY_KYC: KycFiles = { incorporation: null, gst: null, director_id: null }
const KYC_LABELS: Record<KycSlot, { label: string; hint: string }> = {
  incorporation: { label: 'Certificate of incorporation', hint: 'PDF — issued by registrar' },
  gst: { label: 'GST registration certificate', hint: 'PDF or image — current period' },
  director_id: { label: 'Director ID (Aadhaar / passport)', hint: 'PDF or image — at least one director' },
}

function isKycValid(k: KycFiles) {
  return Object.values(k).every((f) => f != null)
}

// ─── Step 3 — Connectors ───────────────────────────────────────────────────────

type ConnectorKey = 'Razorpay' | 'Cashfree' | 'PayU' | 'Stripe'
type ConnectorCreds = Record<ConnectorKey, { keyId: string; keySecret: string; webhookUrl: string }>
const EMPTY_CONNECTORS: ConnectorCreds = {
  Razorpay: { keyId: '', keySecret: '', webhookUrl: '' },
  Cashfree: { keyId: '', keySecret: '', webhookUrl: '' },
  PayU: { keyId: '', keySecret: '', webhookUrl: '' },
  Stripe: { keyId: '', keySecret: '', webhookUrl: '' },
}

function isConnectorConnected(c: ConnectorCreds[ConnectorKey]) {
  return c.keyId.trim().length > 4 && c.keySecret.trim().length > 4
}

function isConnectorsValid(c: ConnectorCreds) {
  return (Object.keys(c) as ConnectorKey[]).some((k) => isConnectorConnected(c[k]))
}

// ─── Step 4 — Plan + payment ───────────────────────────────────────────────────

type PlanId = 'free' | 'pro' | 'business'
type PaymentForm = {
  planId: PlanId
  cardName: string
  cardNumber: string
  cardExpiry: string
  cardCvv: string
  postal: string
}
const EMPTY_PAYMENT: PaymentForm = {
  planId: 'pro',
  cardName: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
  postal: '',
}

const PLANS: { id: PlanId; name: string; price: string; features: string[]; recommended?: boolean }[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0/mo',
    features: ['10 intents/day', 'Sandbox only', 'Email support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Pricing at activation',
    features: ['Higher intent volume', 'Email + chat support', 'Basic analytics'],
    recommended: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 'Pricing at activation',
    features: ['Team-scale volume', 'Phone support', 'Advanced analytics', 'Team seats'],
  },
]

function isPaymentValid(p: PaymentForm) {
  if (p.planId === 'free') return true // Free plan needs no payment.
  return (
    p.cardName.trim().length > 1 &&
    p.cardNumber.replace(/\s+/g, '').length >= 13 &&
    /^\d{2}\/\d{2}$/.test(p.cardExpiry.trim()) &&
    /^\d{3,4}$/.test(p.cardCvv.trim()) &&
    /^\d{4,8}$/.test(p.postal.trim())
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ActivateLiveWizard({ onClose }: { onClose: () => void }) {
  const { setLiveActivationStatus } = useEnvironment()
  const [step, setStep] = useState<Step>(1)
  const [confirmExit, setConfirmExit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [business, setBusiness] = useState<BusinessForm>(EMPTY_BUSINESS)
  const [kyc, setKyc] = useState<KycFiles>(EMPTY_KYC)
  const [connectors, setConnectors] = useState<ConnectorCreds>(EMPTY_CONNECTORS)
  const [payment, setPayment] = useState<PaymentForm>(EMPTY_PAYMENT)

  const stepValid = useMemo(() => {
    if (step === 1) return isBusinessValid(business)
    if (step === 2) return isKycValid(kyc)
    if (step === 3) return isConnectorsValid(connectors)
    if (step === 4) return isPaymentValid(payment)
    return true
  }, [step, business, kyc, connectors, payment])

  // Esc → confirm-exit dialog (don't lose input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (submitted || submitting) return
        setConfirmExit(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [submitted, submitting])

  const onSubmit = () => {
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
      setLiveActivationStatus('in_review')
      // Auto-close after 2s success card.
      window.setTimeout(onClose, 2200)
    }, 1400)
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] cursor-default bg-black/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => {
          if (submitted || submitting) return
          setConfirmExit(true)
        }}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[90] flex h-[min(calc(100vh-2rem),48rem)] w-[min(calc(100vw-2rem),52rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        {submitted ? (
          <SubmittedCard onClose={onClose} />
        ) : submitting ? (
          <SubmittingCard />
        ) : (
          <>
            {/* Header + step rail */}
            <header className="border-b border-[#E5E5E5] px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Activate live account</p>
                  <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.01em] text-[#0f172a]">
                    Step {step}/5 · {STEP_LABELS[step]}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmExit(true)}
                  className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[13px] text-[#475569] transition hover:bg-[#fafafa]"
                >
                  Save & close
                </button>
              </div>

              {/* Progress rail */}
              <ol className="mt-3 flex items-center gap-1.5">
                {([1, 2, 3, 4, 5] as Step[]).map((i) => {
                  const done = i < step
                  const active = i === step
                  return (
                    <li key={i} className="flex flex-1 items-center gap-1.5">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          done
                            ? 'bg-black text-white'
                            : active
                              ? 'bg-[#0f172a] text-white'
                              : 'border border-[#E5E5E5] bg-white text-[#94a3b8]'
                        }`}
                      >
                        {done ? <Glyph name="check" className="h-2.5 w-2.5" /> : i}
                      </span>
                      <span className={`text-[11px] font-medium uppercase tracking-[0.08em] ${active ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>
                        {STEP_LABELS[i]}
                      </span>
                      {i < 5 ? <span className="ml-1 h-px flex-1 bg-[#E5E5E5]" aria-hidden /> : null}
                    </li>
                  )
                })}
              </ol>
            </header>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {step === 1 ? <BusinessStep value={business} onChange={setBusiness} /> : null}
              {step === 2 ? <KycStep value={kyc} onChange={setKyc} /> : null}
              {step === 3 ? <ConnectorsStep value={connectors} onChange={setConnectors} /> : null}
              {step === 4 ? <PlanStep value={payment} onChange={setPayment} /> : null}
              {step === 5 ? (
                <ReviewStep business={business} kyc={kyc} connectors={connectors} payment={payment} />
              ) : null}
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-between gap-3 border-t border-[#E5E5E5] bg-[#fafafa] px-6 py-3">
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                disabled={step === 1}
                className="rounded-[8px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-medium text-[#475569] transition hover:bg-[#f3f3ee] disabled:opacity-40"
              >
                Back
              </button>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => ((s + 1) as Step))}
                  disabled={!stepValid}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m4 3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-black px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
                >
                  Submit for review
                  <Glyph name="check" className="h-3 w-3" />
                </button>
              )}
            </footer>
          </>
        )}
      </div>

      {confirmExit ? (
        <ConfirmExitDialog
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => {
            setConfirmExit(false)
            onClose()
          }}
        />
      ) : null}
    </>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function BusinessStep({ value, onChange }: { value: BusinessForm; onChange: (v: BusinessForm) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#64748b]">Tell us about your registered entity. Names must match documents you&apos;ll upload next.</p>
      <Input
        label="Legal business name *"
        placeholder="e.g. Arealis Technologies Pvt Ltd"
        value={value.legalName}
        onChange={(legalName) => onChange({ ...value, legalName })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Business type *"
          value={value.businessType}
          onChange={(businessType) => onChange({ ...value, businessType: businessType as BusinessForm['businessType'] })}
          options={[
            { value: '', label: 'Select type…' },
            { value: 'pvt_ltd', label: 'Private Limited' },
            { value: 'llp', label: 'LLP' },
            { value: 'public', label: 'Public Limited' },
            { value: 'sole_prop', label: 'Sole Proprietorship' },
          ]}
        />
        <Input
          label="Tax ID / CIN *"
          placeholder="e.g. U72200KA2024PTC123456"
          value={value.taxId}
          onChange={(taxId) => onChange({ ...value, taxId })}
          mono
        />
      </div>
      <Input
        label="Registered address *"
        placeholder="Street, building, suite"
        value={value.addressLine1}
        onChange={(addressLine1) => onChange({ ...value, addressLine1 })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="City *" placeholder="Bengaluru" value={value.city} onChange={(city) => onChange({ ...value, city })} />
        <Input label="State *" placeholder="Karnataka" value={value.state} onChange={(state) => onChange({ ...value, state })} />
        <Input label="Postal code *" placeholder="560001" value={value.postalCode} onChange={(postalCode) => onChange({ ...value, postalCode })} />
      </div>
    </div>
  )
}

function KycStep({ value, onChange }: { value: KycFiles; onChange: (v: KycFiles) => void }) {
  const onPick = (slot: KycSlot, file: File | null) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('File must be 10MB or smaller')
      return
    }
    onChange({ ...value, [slot]: { name: file.name, size: file.size } })
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#64748b]">
        Upload PDFs or images for each. Max 10MB per file. Files are encrypted at rest.
      </p>
      {(Object.keys(KYC_LABELS) as KycSlot[]).map((slot) => {
        const file = value[slot]
        const meta = KYC_LABELS[slot]
        return (
          <label
            key={slot}
            className={`group flex cursor-pointer items-start gap-3 rounded-[12px] border p-4 transition ${
              file ? 'border-black/30 bg-neutral-100/40' : 'border-[#E5E5E5] bg-white hover:border-[#0f172a]/30'
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#0f172a] text-white">
              <Glyph name="document" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#0f172a]">{meta.label}</p>
                {file ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-black/30 bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-black">
                    <Glyph name="check" className="h-2.5 w-2.5" />
                    Loaded
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12px] text-[#64748b]">{meta.hint}</p>
              {file ? (
                <p className="mt-1 truncate font-mono text-[12px] text-[#0f172a]" title={file.name}>
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              ) : (
                <p className="mt-1 text-[12px] italic text-[#94a3b8]">Click to choose file…</p>
              )}
            </div>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => onPick(slot, e.target.files?.[0] ?? null)}
            />
          </label>
        )
      })}
    </div>
  )
}

function ConnectorsStep({ value, onChange }: { value: ConnectorCreds; onChange: (v: ConnectorCreds) => void }) {
  const [open, setOpen] = useState<ConnectorKey | null>(null)
  const psps: { key: ConnectorKey; rails: string[] }[] = [
    { key: 'Razorpay', rails: ['IMPS', 'NEFT', 'NACH'] },
    { key: 'Cashfree', rails: ['IMPS', 'UPI', 'NEFT'] },
    { key: 'PayU', rails: ['IMPS', 'NACH'] },
    { key: 'Stripe', rails: ['Card', 'Bank Transfer'] },
  ]

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#64748b]">
        Connect at least one PSP. Paste your <strong>live</strong> credentials — sandbox keys won&apos;t work in production.
      </p>
      <ul className="space-y-2">
        {psps.map(({ key, rails }) => {
          const connected = isConnectorConnected(value[key])
          return (
            <li key={key}>
              <div
                className={`flex flex-wrap items-center gap-3 rounded-[12px] border p-3 ${
                  connected ? 'border-black/30 bg-neutral-100/40' : 'border-[#E5E5E5] bg-white'
                }`}
              >
                <EntityLogo name={key} kind="psp" size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#0f172a]">{key}</p>
                  <p className="text-[12px] text-[#64748b]">{rails.join(' · ')}</p>
                </div>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-black/30 bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-black">
                    <Glyph name="check" className="h-2.5 w-2.5" />
                    Connected
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen((o) => (o === key ? null : key))}
                  className="rounded-[6px] border border-[#E5E5E5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
                >
                  {connected ? 'Edit' : 'Connect'}
                </button>
              </div>

              {open === key ? (
                <div className="mt-2 space-y-2 rounded-[10px] border border-[#E5E5E5] bg-[#fafafa] p-3">
                  <Input
                    label="Key ID"
                    placeholder={`${key.toLowerCase()}_live_…`}
                    value={value[key].keyId}
                    onChange={(keyId) => onChange({ ...value, [key]: { ...value[key], keyId } })}
                    mono
                  />
                  <Input
                    label="Key secret"
                    placeholder="••••••"
                    type="password"
                    value={value[key].keySecret}
                    onChange={(keySecret) => onChange({ ...value, [key]: { ...value[key], keySecret } })}
                    mono
                  />
                  <Input
                    label="Webhook URL (optional)"
                    placeholder="https://api.yourdomain.com/zord/webhook"
                    value={value[key].webhookUrl}
                    onChange={(webhookUrl) => onChange({ ...value, [key]: { ...value[key], webhookUrl } })}
                    mono
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PlanStep({ value, onChange }: { value: PaymentForm; onChange: (v: PaymentForm) => void }) {
  const requiresCard = value.planId !== 'free'
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#64748b]">Choose a plan and add a payment method. You can change plans anytime.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const selected = value.planId === plan.id
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onChange({ ...value, planId: plan.id })}
              className={`flex flex-col rounded-[12px] border p-4 text-left transition ${
                selected ? 'border-[#0f172a] bg-[#f7f7f4] ring-2 ring-[#0f172a]/10' : 'border-[#E5E5E5] bg-white hover:border-[#0f172a]/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-[#0f172a]">{plan.name}</p>
                {plan.recommended ? (
                  <span className="rounded-full border border-black/30 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
                    Recommended
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[21px] font-semibold tabular-nums text-[#0f172a]">{plan.price}</p>
              <ul className="mt-2 space-y-1 text-[12px] text-[#64748b]">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5">
                    <Glyph name="check" className="h-3 w-3 text-black" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      {requiresCard ? (
        <div className="rounded-[12px] border border-[#E5E5E5] bg-white p-4">
          <p className="text-[13px] font-semibold text-[#0f172a]">Payment method</p>
          <p className="mt-0.5 text-[12px] text-[#64748b]">
            Card details are tokenized — Zord never sees your raw card number. (Demo: any digits accepted.)
          </p>
          <div className="mt-3 space-y-3">
            <Input
              label="Cardholder name"
              placeholder="As printed on card"
              value={value.cardName}
              onChange={(cardName) => onChange({ ...value, cardName })}
            />
            <Input
              label="Card number"
              placeholder="4242 4242 4242 4242"
              value={value.cardNumber}
              onChange={(cardNumber) => onChange({ ...value, cardNumber })}
              mono
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="MM/YY" placeholder="06/28" value={value.cardExpiry} onChange={(cardExpiry) => onChange({ ...value, cardExpiry })} mono />
              <Input label="CVV" placeholder="123" type="password" value={value.cardCvv} onChange={(cardCvv) => onChange({ ...value, cardCvv })} mono />
              <Input label="Postal code" placeholder="560001" value={value.postal} onChange={(postal) => onChange({ ...value, postal })} mono />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReviewStep({
  business,
  kyc,
  connectors,
  payment,
}: {
  business: BusinessForm
  kyc: KycFiles
  connectors: ConnectorCreds
  payment: PaymentForm
}) {
  const connectedKeys = (Object.keys(connectors) as ConnectorKey[]).filter((k) => isConnectorConnected(connectors[k]))
  const plan = PLANS.find((p) => p.id === payment.planId)!
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#64748b]">Review what you&apos;ve entered. After submission, our team will verify within ~24h.</p>

      <ReviewSection title="Business">
        <ReviewField label="Legal name" value={business.legalName} />
        <ReviewField label="Business type" value={business.businessType.replace('_', ' ')} />
        <ReviewField label="Tax ID" value={business.taxId} mono />
        <ReviewField
          label="Address"
          value={`${business.addressLine1}, ${business.city}, ${business.state} ${business.postalCode}`}
        />
      </ReviewSection>

      <ReviewSection title="KYC documents">
        {(Object.keys(KYC_LABELS) as KycSlot[]).map((slot) => (
          <ReviewField key={slot} label={KYC_LABELS[slot].label} value={kyc[slot]?.name ?? '—'} mono />
        ))}
      </ReviewSection>

      <ReviewSection title={`Connectors (${connectedKeys.length})`}>
        {connectedKeys.length === 0 ? (
          <p className="text-[12px] text-rose-700">No connectors connected — go back and connect at least one.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {connectedKeys.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[12px] text-[#0f172a]">
                <EntityLogo name={k} kind="psp" size={16} />
                {k}
              </span>
            ))}
          </div>
        )}
      </ReviewSection>

      <ReviewSection title="Plan">
        <ReviewField label="Plan" value={`${plan.name} · ${plan.price}`} />
        {payment.planId !== 'free' ? (
          <ReviewField
            label="Payment"
            value={`Card ending ${payment.cardNumber.replace(/\s+/g, '').slice(-4) || '••••'}`}
            mono
          />
        ) : null}
      </ReviewSection>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[#E5E5E5] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{title}</p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  )
}

function ReviewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="text-[12px] text-[#64748b]">{label}</p>
      <p className={`text-[13px] text-[#0f172a] ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function SubmittingCard() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-10 text-center">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#0f172a]/10" />
        <span className="absolute inset-1 animate-spin rounded-full border-2 border-[#0f172a]/20 border-t-[#0f172a]" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-[#0f172a]">Submitting application…</p>
      <p className="mt-1 text-[13px] text-[#64748b]">Encrypting documents · queueing review</p>
    </div>
  )
}

function SubmittedCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black text-white shadow-[0_8px_28px_rgba(0,0,0,0.4)]">
        <Glyph name="check" className="h-8 w-8" />
      </span>
      <h3 className="mt-4 text-[21px] font-semibold tracking-[-0.01em] text-[#0f172a]">Submitted for review</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[#64748b]">
        We&apos;ll verify your business + KYC + connector credentials within ~24 hours. Sandbox stays usable while we review.
        We&apos;ll email you the moment live keys are ready.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black"
      >
        Back to sandbox
      </button>
    </div>
  )
}

function ConfirmExitDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-[100] cursor-default bg-black/50" onClick={onCancel} aria-label="Cancel" />
      <div
        className="fixed left-1/2 top-1/2 z-[110] w-[min(calc(100vw-2rem),26rem)] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[#E5E5E5] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        <p className="text-[15px] font-semibold text-[#0f172a]">Save & exit?</p>
        <p className="mt-1 text-[13px] text-[#64748b]">
          Your progress will be saved on this device. Resume anytime from the console home.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black"
          >
            Save & exit
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Inputs ────────────────────────────────────────────────────────────────────

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  mono?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 h-9 w-full rounded-[8px] border border-[#E5E5E5] bg-white px-3 text-[13px] text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f172a]/40 focus:ring-2 focus:ring-[#0f172a]/10 ${mono ? 'font-mono' : ''}`}
      />
    </label>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0f172a] outline-none transition focus:border-[#0f172a]/40 focus:ring-2 focus:ring-[#0f172a]/10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
