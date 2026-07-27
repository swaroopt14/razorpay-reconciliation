'use client'

import Image from 'next/image'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import {
  LandingReveal,
  LandingSection,
  LandingSectionHeader,
  LIGHT_FEATURE_CARD,
} from '@/components/landing-final/landingSectionLayout'

const stages = landingHomeCopy.howItWorks.stages

const STAGE_IMAGES = [
  '/final-landing/sections/people-intent.png',
  '/final-landing/sections/people-provider.png',
  '/final-landing/sections/people-settlement.png',
  '/final-landing/sections/people-evidence.png',
] as const

export function LandingHowItWorksSection() {
  return (
    <LandingSection
      id="how-it-works"
      className="scroll-mt-32 py-16 pb-20 sm:py-20 sm:pb-24 lg:py-24 lg:pb-28"
      aria-label="How Zord works"
    >
      <LandingReveal>
        <LandingSectionHeader
          badge="How it works"
          title="The operating model behind"
          titleAccent="control"
        />
      </LandingReveal>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:gap-8 xl:grid-cols-4">
        {stages.map((stage, index) => (
          <article key={stage.step} className={`${LIGHT_FEATURE_CARD} flex flex-col overflow-hidden p-0`}>
            <div className="relative h-48 w-full shrink-0 border-b border-[#E5E7EB] bg-[#F8F9FA] sm:h-52">
              <Image
                src={STAGE_IMAGES[index] ?? STAGE_IMAGES[0]}
                alt=""
                fill
                className="object-cover object-center opacity-90 transition-transform duration-700 hover:scale-105"
                sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
              />
            </div>
            <div className="flex flex-1 flex-col p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] font-semibold tracking-[0.1em] text-[#B8BFCA]">[ {stage.step} ]</span>
                <span className="text-[11px] font-medium text-[#9CA3AF]">{stage.footnote}</span>
              </div>
              <h3 className="mt-5 text-[1.1rem] font-semibold tracking-[-0.02em] text-[#1A1A1A]">{stage.label}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[#4B5563]">{stage.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </LandingSection>
  )
}
