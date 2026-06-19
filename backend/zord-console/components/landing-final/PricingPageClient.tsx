'use client'

import { useMemo, useState } from 'react'

import { landingPricingCopy } from '@/components/landing-final/copy/landingPagesCopy'
import { FinalLandingPageScaffold } from '@/components/landing-final/FinalLandingPageScaffold'

const { product: payoutProduct, plans: pricingPlans, faqs: pricingFaqs, heroStats } = landingPricingCopy

const pageCardStyle = {
  background:
    'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
} as const

export default function PricingPageClient() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const activeFamily = useMemo(() => payoutProduct, [])

  return (
    <FinalLandingPageScaffold
      active="Pricing"
      eyebrow={landingPricingCopy.eyebrow}
      title={landingPricingCopy.title}
      description={landingPricingCopy.description}
      primaryAction={{ label: 'Contact sales', href: 'mailto:hello@arelais.com?subject=Pricing%20discussion%20for%20ZORD' }}
      secondaryAction={{ label: 'Back to product', href: '/' }}
      heroVisual={{
        src: '/final-landing/sections/finance-ops-collaboration.png',
        alt: 'Finance and operations leaders reviewing payout evidence and rollout fit together',
        eyebrow: 'Commercial context',
        title: 'Price the operating layer against the cost of slower close, fragmented proof, and manual recovery.',
        body: 'The right commercial model depends on workspace depth, connector coverage, and how much payout investigation your team carries today.',
        stats: [...heroStats],
        imagePosition: 'right',
        imageClassName: 'object-cover object-[56%_center]',
      }}
    >
      <section className="mx-auto mt-12 max-w-6xl">
        <div className="rounded-[2rem] border border-white/10 p-4 sm:p-5" style={pageCardStyle}>
          <div className="mt-1 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[1.7rem] border border-white/10 p-7" style={pageCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A7AE]">
                {activeFamily.eyebrow}
              </div>
              <div className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                {activeFamily.kicker}
              </div>
              <div className="mt-3 text-[3rem] font-semibold tracking-[-0.06em] text-white md:text-[3.8rem]">
                {activeFamily.metric}
              </div>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">{activeFamily.detail}</p>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-400">{activeFamily.subdetail}</p>

              <div className="mt-8 space-y-4">
                {activeFamily.highlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#c6efcf]" />
                    <p className="text-[15px] leading-7 text-slate-200">{highlight}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {activeFamily.stats.map(([label, value], index) => (
                <div
                  key={label}
                  className="rounded-[1.5rem] border border-white/10 p-6"
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
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                  <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        <div className="mb-8 max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Rollout paths</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Sandbox first, then commercials with sales.</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <div
              key={plan.title}
              className={`rounded-[2rem] border p-8 ${
                'featured' in plan && plan.featured ? 'border-[#c6efcf]/30' : 'border-white/10'
              }`}
              style={
                'featured' in plan && plan.featured
                  ? {
                      ...pageCardStyle,
                      background:
                        'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.12), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
                    }
                  : pageCardStyle
              }
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{plan.subtitle}</div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">{plan.title}</h3>
              <div className="mt-4 text-xl font-semibold text-[#c6efcf]">{plan.metric}</div>
              <p className="mt-4 text-[15px] leading-7 text-slate-400">{plan.detail}</p>
              <ul className="mt-6 space-y-3">
                {plan.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[14px] leading-7 text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c6efcf]" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-[2rem] border border-white/10 p-6 sm:p-8" style={pageCardStyle}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">FAQs</div>
        <div className="mt-6 divide-y divide-white/10">
          {pricingFaqs.map((faq, index) => (
            <div key={faq.question} className="py-5">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <span className="text-lg font-semibold text-white">{faq.question}</span>
                <span className="text-2xl text-slate-400">{openFaq === index ? '−' : '+'}</span>
              </button>
              {openFaq === index ? (
                <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-400">{faq.answer}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </FinalLandingPageScaffold>
  )
}
