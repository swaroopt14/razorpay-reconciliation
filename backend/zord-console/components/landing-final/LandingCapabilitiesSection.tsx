'use client'

import Image from 'next/image'
import { Check } from 'lucide-react'
import {
  LANDING_SECTION_SHELL,
  LandingReveal,
} from '@/components/landing-final/landingSectionLayout'
import { landingPricingCopy } from '@/components/landing-final/copy/landingPagesCopy'

const plans = landingPricingCopy.plans

export function LandingCapabilitiesSection() {
  return (
    <section
      id="use-cases"
      aria-label="Product capabilities"
      className="relative scroll-mt-32 overflow-hidden py-16 pb-20 sm:py-24 sm:pb-32 lg:py-32 lg:pb-40"
    >
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <Image
          src="/final-landing/sections/mossy-rocks-bg.png"
          alt=""
          fill
          unoptimized
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/35" />
      </div>

      <div className={`${LANDING_SECTION_SHELL} relative z-10`}>
      <div className="mx-auto max-w-5xl">
        <LandingReveal className="flex flex-col items-center text-center">
          <p className="mb-6 inline-flex w-fit rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/80">
            WHY ZORD
          </p>
          <h2 className="max-w-[20ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[3.25rem] lg:text-[4rem]">
            Built for payout teams.<br />
            Not another payments black box.
          </h2>
          <p className="mt-6 max-w-2xl text-[15px] sm:text-base font-medium leading-relaxed text-white/70">
            See money you meant to pay next to what the bank confirmed, resolve gaps, and keep proof packs ready - in one shared
            place for ops and finance.
          </p>
        </LandingReveal>

        <LandingReveal className="mt-20 sm:mt-24">
          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => {
              const featured = 'featured' in plan && plan.featured
              return (
                <article
                  key={plan.title}
                  className={`flex flex-col rounded-[1.75rem] border p-6 sm:p-7 ${
                    featured
                      ? 'border-[#34D399]/35 bg-[#F0FDF9] shadow-[0_24px_60px_rgba(5,150,105,0.14)]'
                      : 'border-black/[0.06] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.18)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                        {plan.subtitle}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">{plan.title}</h3>
                    </div>
                    {featured ? (
                      <span className="shrink-0 rounded-full bg-[#047857] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-5 text-[1.65rem] font-semibold tracking-[-0.04em] text-[#047857]">{plan.metric}</p>
                  <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">{plan.detail}</p>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-[14px] text-[#374151]">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F8F5] text-[#059669]">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={
                      plan.title === 'Try first'
                        ? '/signin'
                        : 'mailto:Support@zordnet.com?subject=ZORD%20pricing%20discussion'
                    }
                    className={`mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full px-5 py-3.5 text-[14px] font-semibold transition-colors duration-150 ${
                      featured
                        ? 'bg-[#111111] text-white hover:bg-black/90'
                        : 'border border-black/10 bg-[#F7F8FA] text-[#111111] hover:bg-[#F0F1F3]'
                    }`}
                  >
                    {plan.title === 'Try first' ? 'Try first' : 'Talk to sales'}
                  </a>
                </article>
              )
            })}
          </div>
        </LandingReveal>
      </div>
      </div>
    </section>
  )
}
