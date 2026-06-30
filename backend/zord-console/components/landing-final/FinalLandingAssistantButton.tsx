'use client'

function DockIcon({
  name,
  className = '',
}: {
  name: 'home' | 'chat' | 'zap' | 'document' | 'grid' | 'bank' | 'refresh'
  className?: string
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {name === 'home' ? (
        <>
          <path d="M5.2 10.1 12 4.7l6.8 5.4v8.3H5.2v-8.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9.4 18.4v-5h5.2v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'chat' ? (
        <>
          <path
            d="M6.1 6.2h11.8a3.1 3.1 0 0 1 3.1 3.1v6a3.1 3.1 0 0 1-3.1 3.1H12l-4.15 2.8c-.44.3-1.03-.03-1.03-.56v-2.24H6.1A3.1 3.1 0 0 1 3 15.3v-6a3.1 3.1 0 0 1 3.1-3.1Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="15" cy="12" r="1.2" fill="currentColor" />
        </>
      ) : null}
      {name === 'zap' ? (
        <path d="M12.8 3.3 7.2 12h3.4l-.6 8.4 5.8-8.8h-3.4l.4-8.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {name === 'document' ? (
        <>
          <path d="M7 4.4h7.2l3 3.1v11A1.9 1.9 0 0 1 15.3 20H8.7A1.9 1.9 0 0 1 6.8 18.1V6.3A1.9 1.9 0 0 1 8.7 4.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14.2 4.4v3.1h3M9.4 11h5.4M9.4 14.6h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'grid' ? (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
          <rect x="14" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
          <rect x="4" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
          <rect x="14" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
        </>
      ) : null}
      {name === 'bank' ? (
        <>
          <path d="M3.8 8.7 12 4l8.2 4.7M6.1 10.2v8M10.1 10.2v8M13.9 10.2v8M17.9 10.2v8M3.4 18.8h17.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'refresh' ? (
        <path d="M18.5 8.3V4.9L15 8A7.4 7.4 0 1 0 19.2 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  )
}

export function FinalLandingAssistantButton() {
  const dockButtons = [
    { name: 'home' as const, label: 'Home', href: '/' },
    { name: 'chat' as const, label: 'Talk to ZORD', href: 'mailto:Support@zordnet.com?subject=Talk%20to%20ZORD%20Copilot', active: true },
    { name: 'zap' as const, label: 'Escalations', href: '/#product' },
    { name: 'document' as const, label: 'Docs', href: '/final-landing/resources' },
    { name: 'grid' as const, label: 'Solutions', href: '/final-landing/solutions' },
    { name: 'bank' as const, label: 'Customers', href: '/final-landing/customers' },
    { name: 'refresh' as const, label: 'Pricing', href: '/final-landing/pricing' },
  ]

  return (
    <div
      className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-[1.5rem] border border-white/14 px-3 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.24)] sm:bottom-6 sm:right-6"
      style={{
        background:
          'radial-gradient(circle at 50% 0%, rgba(198,239,207,0.14), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        boxShadow:
          '0 18px 36px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      <span className="pointer-events-none absolute inset-[1px] rounded-[1.45rem] border border-white/[0.06]" />
      {dockButtons.map((button) => (
        <a
          key={button.label}
          href={button.href}
          aria-label={button.label}
          className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-[0.95rem] border transition duration-200 ${
            button.active
              ? 'border-black/80 bg-[#0f1012] text-white shadow-[0_14px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'border-white/8 bg-white/[0.04] text-[#d8d3ec] hover:border-[#c6efcf]/40 hover:bg-white/[0.08] hover:text-[#e9fff0]'
          }`}
        >
          <DockIcon name={button.name} className="h-5 w-5" />
        </a>
      ))}
    </div>
  )
}
