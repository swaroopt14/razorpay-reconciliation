'use client'

import Image from 'next/image'
import { Check } from 'lucide-react'
import {
  LandingReveal,
  LandingSection,
  LandingSectionHeader,
} from '@/components/landing-final/landingSectionLayout'

const comparisonData = [
  { feature: 'Multi-rail routing & processing', zord: true, other: false },
  { feature: 'Real-time data & synchronization', zord: true, other: true },
  { feature: 'AI-driven anomaly detection', zord: true, other: false },
  { feature: 'Unified dashboard across all systems', zord: true, other: true },
  { feature: 'Automated Evidence Pack generation', zord: true, other: false },
]

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
          <div className="relative mx-auto max-w-[900px]">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_160px_160px] items-end gap-4 px-8 pb-4 text-[13px] font-medium text-white/50">
              <div>Core capabilities</div>
              <div className="text-center invisible">Zord</div> {/* Hidden header, covered by the card */}
              <div className="text-center">Other platform</div>
            </div>

            {/* Glass Container */}
            <div className="relative rounded-[2rem] border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-2xl">
              <div className="flex flex-col gap-6 relative z-10">
                {comparisonData.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_160px_160px] items-center gap-4 border-b border-white/10 pb-6 last:border-0 last:pb-0">
                    <div className="text-[15px] font-medium text-white">{row.feature}</div>
                    <div className="text-center" /> {/* Spacer for Zord column */}
                    <div className="text-center text-[13px] font-medium text-white/60">
                      {row.other ? <Check className="mx-auto h-5 w-5" /> : 'Absent'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer row */}
              <div className="mt-8 grid grid-cols-[1fr_160px_160px] items-center gap-4 pt-6 relative z-10 border-t border-white/10">
                <div>
                  <div className="text-[14px] font-semibold text-white">Total operational cost:</div>
                  <div className="text-[12px] text-white/60">Based on typical multi-platform setups.</div>
                </div>
                <div className="text-center" /> {/* Spacer for Zord column */}
                <div className="text-center text-[14px] font-semibold text-white">$1,700 / month</div>
              </div>

              {/* The Elevated Zord Column Card */}
              <div className="absolute -inset-y-6 right-[192px] w-[180px] rounded-[1.5rem] bg-[#F4F6D4] shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col z-20">
                <div className="flex h-20 items-center justify-center border-b border-black/10 font-bold text-lg tracking-tight text-[#1A1A1A]">
                  <span className="mr-2 h-4 w-4 bg-[#1A1A1A] mask-squircle" /> zord
                </div>
                <div className="flex flex-1 flex-col gap-6 px-4 py-8">
                  {comparisonData.map((row, i) => (
                    <div key={i} className="flex items-center justify-center h-[22px]">
                      {row.zord && <Check className="h-6 w-6 text-[#1A1A1A]" strokeWidth={2.5} />}
                    </div>
                  ))}
                </div>
                <div className="flex h-24 items-center justify-center font-bold text-[15px] text-[#1A1A1A] border-t border-black/10">
                  $499 / month
                </div>
              </div>
            </div>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  )
}
