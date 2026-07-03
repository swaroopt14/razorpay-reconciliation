'use client'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import {
  LandingReveal,
  LandingSection,
} from '@/components/landing-final/landingSectionLayout'

const stages = landingHomeCopy.howItWorks.stages

export function LandingHowItWorksSection() {
  return (
    <LandingSection
      id="how-it-works"
      className="scroll-mt-32 py-16 pb-20 sm:py-20 sm:pb-24 lg:py-24 lg:pb-28 bg-[#FAFAFA]"
      aria-label="How Zord works"
    >
      <LandingReveal>
        <h2 className="text-[2rem] font-bold leading-tight tracking-tight text-[#111111] sm:text-4xl max-w-xl">
          Get the Most Out<br />
          of Your Investments
        </h2>
      </LandingReveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:gap-8">
        {stages.map((stage, index) => (
          <article 
            key={stage.step} 
            className="group relative flex flex-col overflow-hidden rounded-[2rem] bg-white p-8 shadow-sm border border-black/5 hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col h-full relative z-10">
              <h3 className="text-xl font-bold tracking-tight text-[#111111]">{stage.label}</h3>
              <p className="mt-4 text-[15px] leading-relaxed text-[#111111]/60 max-w-[280px]">
                {stage.detail}
              </p>
              <div className="mt-8 flex items-center gap-2 text-[14px] font-semibold text-[#111111] cursor-pointer">
                Read More
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-1">
                  <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            
            {/* Abstract Accent based on index to mimic the reference image */}
            {index === 0 && (
              <div className="absolute right-[-10%] bottom-[-20%] w-48 h-48 bg-[#DBF33C] rounded-3xl rotate-12 opacity-80" />
            )}
            {index === 1 && (
              <div className="absolute right-0 bottom-0 w-32 h-32 rounded-tl-[100px] border-[16px] border-[#DBF33C] opacity-80" />
            )}
            {index === 2 && (
              <div className="absolute right-[-5%] bottom-[-5%] w-40 h-40 rounded-full bg-[#111111] opacity-5" />
            )}
            {index === 3 && (
              <div className="absolute right-[5%] bottom-[10%] w-24 h-24 rounded-full border-[12px] border-[#DBF33C] opacity-80" />
            )}
          </article>
        ))}
      </div>
    </LandingSection>
  )
}
