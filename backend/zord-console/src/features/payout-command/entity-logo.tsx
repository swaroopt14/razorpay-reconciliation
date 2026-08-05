import Image from 'next/image'

type EntityKind = 'psp' | 'bank'

type LogoConfig = {
  src: string
  frame: 'square' | 'landscape'
  scale?: number
  objectPosition?: string
}

const PSP_LOGO_MAP: Record<string, LogoConfig> = {
  Razorpay: { src: '/sources/razorpay-clean.png', frame: 'landscape', scale: 1.34 },
  RazorpayX: { src: '/sources/razorpay-clean.png', frame: 'landscape', scale: 1.34 },
  Cashfree: { src: '/sources/cashfree-clean.png', frame: 'landscape', scale: 1.32 },
  PayU: { src: '/sources/Payu.png', frame: 'landscape', scale: 1.28 },
  Stripe: { src: '/sources/stripe-clean.png', frame: 'landscape', scale: 1.26 },
}

const BANK_LOGO_MAP: Record<string, LogoConfig> = {
  'ICICI Bank': { src: '/sources/icici.png', frame: 'square', scale: 1.18 },
  SBI: { src: '/sources/sbi-clean.png', frame: 'landscape', scale: 1.28 },
  'HDFC Bank': { src: '/sources/hdfc-bank-clean.png', frame: 'landscape', scale: 1.28 },
  'Axis Bank': { src: '/sources/axis.png', frame: 'landscape', scale: 1.3 },
  Kotak: { src: '/sources/kotak.png', frame: 'landscape', scale: 1.2 },
}

export function inferBankNameFromReference(reference: string): string | null {
  if (!reference || reference === '—' || reference === 'Awaited') return null

  if (/^ICICI/i.test(reference)) return 'ICICI Bank'
  if (/^HDFC/i.test(reference)) return 'HDFC Bank'
  if (/^SBI/i.test(reference)) return 'SBI'
  if (/^AXIS/i.test(reference)) return 'Axis Bank'
  if (/^KOTAK/i.test(reference) || /^KKBK/i.test(reference)) return 'Kotak'

  return null
}

export function EntityLogo({
  name,
  kind,
  size = 44,
  className = '',
}: {
  name: string
  kind: EntityKind
  size?: number
  className?: string
}) {
  const config = kind === 'psp' ? PSP_LOGO_MAP[name] : BANK_LOGO_MAP[name]
  const width = config?.frame === 'landscape' ? Math.round(size * 1.56) : size
  const height = size

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${className}`}
      style={{ width, height }}
      aria-label={name}
      title={name}
    >
      {config ? (
        <div className="relative" style={{ width, height }}>
          <Image
            src={config.src}
            alt={`${name} logo`}
            fill
            sizes={`${width}px`}
            style={{
              objectFit: 'contain',
              objectPosition: config.objectPosition ?? 'center',
              transform: `scale(${config.scale ?? 1})`,
              transformOrigin: 'center',
            }}
          />
        </div>
      ) : (
        <div className="h-2.5 w-2.5 rounded-full bg-[#4A5D4E]/55" aria-hidden />
      )}
    </div>
  )
}
