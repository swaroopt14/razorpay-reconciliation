'use client'

const PROVIDERS = [
  { id: 'razorpay', label: 'Razorpay', logo: '/ecosystem/logos/razorpay.png' },
  { id: 'paytm', label: 'Paytm', logo: '/ecosystem/logos/paytm.png' },
  { id: 'phonepe', label: 'PhonePe', logo: '/ecosystem/logos/phonepe.png' },
  { id: 'cashfree', label: 'Cashfree', logo: '/ecosystem/logos/cashfree.png' },
  { id: 'payu', label: 'PayU', logo: '/ecosystem/logos/payu.png' },
] as const

export type PaymentProviderId = (typeof PROVIDERS)[number]['id']

export function resolvePaymentProvider(raw?: string | null): {
  id: PaymentProviderId | 'other'
  label: string
  logo: string | null
} {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  const hit = PROVIDERS.find((p) => key.includes(p.id) || key === p.label.toLowerCase())
  if (hit) return { id: hit.id, label: hit.label, logo: hit.logo }
  if (key) {
    return {
      id: 'other',
      label: raw!.trim().replace(/^\w/, (c) => c.toUpperCase()),
      logo: null,
    }
  }
  return { id: 'razorpay', label: 'Razorpay', logo: '/ecosystem/logos/razorpay.png' }
}

/** Deterministic provider for a payout index (demo spine). */
export function providerForIndex(index: number): (typeof PROVIDERS)[number] {
  return PROVIDERS[Math.abs(index) % PROVIDERS.length]!
}

export function PaymentProviderBadge({
  provider,
  size = 'sm',
}: {
  provider?: string | null
  size?: 'sm' | 'md'
}) {
  const resolved = resolvePaymentProvider(provider)
  const box = size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
  const text = size === 'md' ? 'text-[13px]' : 'text-[12px]'

  return (
    <span className={`inline-flex items-center gap-2 ${text} font-medium text-[#1A1A1A]`}>
      {resolved.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved.logo}
          alt=""
          className={`${box} rounded-[4px] border border-[#EEF0F3] bg-white object-contain p-0.5`}
        />
      ) : (
        <span
          className={`inline-flex ${box} items-center justify-center rounded-[4px] border border-[#EEF0F3] bg-[#F8FAFC] text-[10px] font-semibold text-[#64748B]`}
        >
          {resolved.label.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span>{resolved.label}</span>
    </span>
  )
}
