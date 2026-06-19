'use client'

import Image from 'next/image'

import { buyerPersonas } from '@/components/landing-final/copy/landingPagesCopy'
import { FinalLandingPageScaffold } from '@/components/landing-final/FinalLandingPageScaffold'

const adoptionSignals = [
  { value: 'Shared workspace', label: 'ops, finance, and engineering on one payout record' },
  { value: 'Evidence Packs', label: 'exportable proof for close, disputes, and audit' },
  { value: 'Sandbox first', label: 'evaluate the operating model before production rollout' },
] as const

const pageCardStyle = {
  background:
    'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
} as const

export default function CustomersPageClient() {
  return (
    <FinalLandingPageScaffold
      active="Customers"
      eyebrow="Buyers"
      title="Who brings ZORD into payout environments — and what problem they are solving."
      description="This page describes buyer lenses, not customer logos or outcome statistics. Teams adopt ZORD when payout accountability spans operations, finance, engineering, and risk at the same time."
      primaryAction={{ label: 'Book demo', href: 'mailto:hello@arelais.com?subject=ZORD%20buyer%20discussion' }}
      secondaryAction={{ label: 'Back to product', href: '/' }}
    >
      <section className="mx-auto mt-12 max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10" style={pageCardStyle}>
            <div className="relative min-h-[460px]">
              <Image
                src="/final-landing/pages/customers-hero.png"
                alt="Cross-functional team reviewing payout workspace context together"
                fill
                className="object-cover object-[52%_center]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,10,0.10)_0%,rgba(5,7,10,0.75)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 backdrop-blur-md">
                  Buyer context
                </div>
                <h2 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.05em] text-white">
                  One working view for ops, finance, engineering, and risk.
                </h2>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/78">
                  ZORD fits when payout incidents are no longer isolated technical issues and start becoming customer, finance, and compliance problems at the same time.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {adoptionSignals.map((signal, index) => (
              <div
                key={signal.label}
                className="rounded-[1.6rem] border border-white/10 p-6"
                style={
                  index === 0
                    ? {
                        ...pageCardStyle,
                        background:
                          'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.12), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
                      }
                    : pageCardStyle
                }
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Why teams evaluate</div>
                <div className="mt-3 text-[2.2rem] font-semibold tracking-[-0.05em] text-white">{signal.value}</div>
                <p className="mt-2 text-sm leading-7 text-slate-400">{signal.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        <div className="mb-8 max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Buyer lenses</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Start from the accountability your team carries.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {buyerPersonas.map((persona) => (
            <div key={persona.title} className="rounded-[2rem] border border-white/10 p-8" style={pageCardStyle}>
              <div className="text-lg font-semibold tracking-tight text-white">{persona.title}</div>
              <div className="mt-1 text-[13px] font-medium text-[#c6efcf]">{persona.role}</div>
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
      </section>
    </FinalLandingPageScaffold>
  )
}
