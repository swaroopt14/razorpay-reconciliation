'use client'

import Image from 'next/image'
import { Check } from 'lucide-react'
import {
  LandingReveal,
  LandingSection,
} from '@/components/landing-final/landingSectionLayout'
import { landingPricingCopy } from '@/components/landing-final/copy/landingPagesCopy'

const plans = landingPricingCopy.plans

export function LandingCapabilitiesSection() {
  return (
    <LandingSection
      id="use-cases"
      className="relative overflow-hidden scroll-mt-32 py-16 pb-20 sm:py-24 sm:pb-32 lg:py-32 lg:pb-40"
      aria-label="Product capabilities"
    >
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/final-landing/hero/bg-removebg-preview.png" 
          alt="Mossy rocks background" 
          fill 
          className="object-cover object-bottom"
          sizes="100vw"
        />
        {/* Darker overlay to make white text pop */}
        <div className="absolute inset-0 bg-[#111827]/40" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1A1A24] via-[#1A1A24]/60 to-transparent opacity-90" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
        <LandingReveal className="flex flex-col items-center text-center">
          <p className="mb-6 inline-flex w-fit rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/80">
            WHY ZORD
          </p>
          <h2 className="max-w-[20ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[3.25rem] lg:text-[4rem]">
            Built for modern capital.<br />
            Not legacy systems.
          </h2>
          <p className="mt-6 max-w-2xl text-[15px] sm:text-base font-medium leading-relaxed text-white/70">
            Connect exchanges, custodians, on-chain wallets, and data providers — all synchronized in one unified system for real-time visibility and control.
          </p>
        </LandingReveal>

        <LandingReveal className="mt-20 sm:mt-24">
          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => {
              const featured = 'featured' in plan && plan.featured
              return (
                <article
                  key={plan.title}
                  className={`flex flex-col rounded-[1.75rem] border p-6 shadow-2xl backdrop-blur-2xl sm:p-7 ${
                    featured
                      ? 'border-[#34D399]/40 bg-[#34D399]/12'
                      : 'border-white/20 bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                        {plan.subtitle}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">{plan.title}</h3>
                    </div>
                    {featured ? (
                      <span className="shrink-0 rounded-full bg-[#047857] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-5 text-[1.65rem] font-semibold tracking-[-0.04em] text-[#6EE7B7]">{plan.metric}</p>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/70">{plan.detail}</p>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-[14px] text-white/85">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#34D399]/20 text-[#6EE7B7]">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={
                      plan.title === 'Sandbox'
                        ? '/signin'
                        : 'mailto:Support@zordnet.com?subject=ZORD%20pricing%20discussion'
                    }
                    className={`mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full px-5 py-3.5 text-[14px] font-semibold transition-colors duration-150 ${
                      featured
                        ? 'bg-white text-[#111111] hover:bg-white/92'
                        : 'border border-white/25 bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    {plan.title === 'Sandbox' ? 'Start in sandbox' : 'Talk to sales'}
                  </a>
                </article>
              )
            })}
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  )
}
