'use client'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { LandingReveal, LandingSection } from '@/components/landing-final/landingSectionLayout'

const capabilities = landingHomeCopy.capabilities

export function LandingCapabilitiesSection() {
  return (
    <LandingSection
      id="use-cases"
      className="relative overflow-hidden py-16 pb-20 sm:py-24 sm:pb-32 bg-[#FAFAFA]"
      aria-label="Product capabilities"
    >
      <div className="relative z-10 mx-auto max-w-6xl">
        <LandingReveal className="mb-12">
          <h2 className="text-[2rem] font-bold leading-tight tracking-tight text-[#111111] sm:text-4xl">
            Advantages
          </h2>
          <p className="mt-4 max-w-md text-[15px] font-medium leading-relaxed text-[#111111]/60">
            Get the most out of your investments with Zord. From fast matching to automated evidence generation.
          </p>
        </LandingReveal>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 lg:gap-8">
          {capabilities.map((item, i) => (
            <LandingReveal key={item.title} className="flex gap-6 rounded-[2rem] bg-white p-8 shadow-sm border border-black/5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DBF33C]">
                {/* Check icon or similar abstract shape */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex flex-col justify-start">
                <h3 className="text-[1.15rem] font-bold tracking-tight text-[#111111]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[#111111]/60">
                  {item.description}
                </p>
                <div className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-full border border-black/10 px-6 py-2.5 text-[13px] font-semibold text-[#111111] hover:bg-black/5 transition-colors self-start">
                  Read More
                </div>
              </div>
            </LandingReveal>
          ))}
          {/* Add one more static card to make it a 2x2 grid if capabilities length is 3 */}
          {capabilities.length === 3 && (
            <LandingReveal className="flex gap-6 rounded-[2rem] bg-white p-8 shadow-sm border border-black/5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DBF33C]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="flex flex-col justify-start">
                <h3 className="text-[1.15rem] font-bold tracking-tight text-[#111111]">
                  Lower Costs
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[#111111]/60">
                  We give you the lowest commissions for any kind of transactions. Optimize operational costs instantly.
                </p>
                <div className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-full border border-black/10 px-6 py-2.5 text-[13px] font-semibold text-[#111111] hover:bg-black/5 transition-colors self-start">
                  Read More
                </div>
              </div>
            </LandingReveal>
          )}
        </div>
      </div>
    </LandingSection>
  )
}
