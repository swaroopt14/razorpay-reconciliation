'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { LandingReveal, LandingSection } from '@/components/landing-final/landingSectionLayout'

export function LandingFinalCtaSection() {
  const { title } = landingHomeCopy.finalCta
  const [lead, tail] = title.includes(',') ? title.split(',', 2) : [title, '']

  return (
    <LandingSection id="book" className="scroll-mt-32 py-20 pb-24 sm:py-28 sm:pb-32 lg:py-32 bg-[#FAFAFA]" aria-label="Book a demo">
      <div className="relative overflow-hidden px-6 py-16 sm:px-10 sm:py-20 lg:px-14 lg:py-24 text-center">
        
        <LandingReveal className="relative z-10 mx-auto flex max-w-[920px] flex-col items-center">
          <h2 className="mt-8 max-w-[16ch] text-[2.65rem] font-bold leading-[1.02] tracking-[-0.04em] sm:max-w-none sm:text-[3.4rem] lg:text-[4.25rem] text-[#111111]">
            Get the App for Free<br />
            and Start Now
          </h2>

          <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
            <a
              href="mailto:Support@zordnet.com?subject=Download%20App"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-[#111111] px-8 py-4 text-[15px] font-semibold text-white transition-transform hover:scale-105 sm:w-auto"
            >
              Download App
            </a>
          </div>
        </LandingReveal>

        {/* Abstract scribble accent */}
        <div className="absolute left-[30%] top-[80%] hidden lg:block">
          <svg width="80" height="120" viewBox="0 0 80 120" fill="none" stroke="#111111" strokeWidth="1.5">
            <path d="M40 0 C40 40 80 60 40 80 C0 100 40 120 40 120" />
          </svg>
        </div>
      </div>
    </LandingSection>
  )
}
