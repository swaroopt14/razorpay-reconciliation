'use client'

import { LandingSection, LandingReveal } from '@/components/landing-final/landingSectionLayout'

export function LandingSignalStageSection() {
  return (
    <LandingSection
      className="overflow-hidden pb-24 pt-8 sm:pb-28 lg:pb-32 bg-[#FAFAFA]"
      aria-label="Payout signal intelligence preview"
    >
      <div className="relative mx-auto max-w-5xl rounded-[2.5rem] bg-[#111111] px-8 py-16 sm:px-16 sm:py-24 text-white overflow-hidden">
        {/* Abstract sine wave graphic */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[60%] opacity-20 pointer-events-none">
          <svg viewBox="0 0 400 100" fill="none" stroke="white" strokeWidth="2">
            <path d="M0,50 Q40,10 80,50 T160,50 T240,50 T320,50 T400,50" />
          </svg>
        </div>

        <LandingReveal className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl md:text-[2.75rem]">
            Keep Your Finger on the Investment Market Pulse
          </h2>
          <div className="mt-10">
            <a
              href="#"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-bold text-[#111111] transition-transform hover:scale-105"
            >
              Download App
            </a>
          </div>
        </LandingReveal>

        {/* Mock phone / dashboard floating on right */}
        <LandingReveal className="absolute right-[-10%] top-[10%] hidden w-[360px] lg:block">
          <div className="h-[480px] w-full rounded-[2rem] border-[8px] border-white/10 bg-[#1A1A1A] p-4 shadow-2xl backdrop-blur-xl">
            <div className="h-full w-full rounded-[1.25rem] bg-[#111111] p-4 border border-white/5">
              <div className="text-2xl font-bold text-white mb-2">$14,930.31</div>
              <div className="text-sm text-emerald-400 mb-6">+3.14%</div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex justify-between items-center border-b border-white/5 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10" />
                      <div>
                        <div className="h-3 w-16 bg-white/20 rounded-full mb-1" />
                        <div className="h-2 w-10 bg-white/10 rounded-full" />
                      </div>
                    </div>
                    <div className="h-3 w-12 bg-white/20 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  )
}
