'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { LandingReveal, LandingSection } from '@/components/landing-final/landingSectionLayout'

export function LandingFinalCtaSection() {
  const { title } = landingHomeCopy.finalCta
  const [lead, tail] = title.includes(',') ? title.split(',', 2) : [title, '']

  return (
    <LandingSection id="book" className="scroll-mt-32 py-20 pb-24 sm:py-28 sm:pb-32 lg:py-32" aria-label="Book a demo">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0B1220] px-6 py-16 sm:px-10 sm:py-20 lg:px-14 lg:py-24 shadow-2xl">
        {/* Background Image Effect */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/final-landing/sections/greenery-cta-bg.png" 
            alt="Greenery background" 
            fill 
            className="object-cover object-center"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-[#0B1220]/60 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220]/80 via-transparent to-transparent" />
        </div>
        
        <LandingReveal className="relative z-10 mx-auto flex max-w-[920px] flex-col items-center text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/60">Get started</p>

          <h2 className="mt-8 max-w-[16ch] text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:max-w-none sm:text-[3.4rem] lg:text-[4.25rem]">
            {tail ? (
              <>
                <span className="text-white/60">{lead.trim()},</span>
                <br />
                <span className="text-white">{tail.trim()}</span>
              </>
            ) : (
              <span className="text-white">{title}</span>
            )}
          </h2>

          <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
            <Link
              href="/signin"
              className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-white/10 backdrop-blur-md px-8 py-3.5 text-[15px] font-medium text-white border border-white/20 transition-colors duration-150 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 sm:w-auto focus:ring-offset-[#0B1220]"
            >
              Launch
            </Link>
            <Link
              href="/signup"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-white py-2 pl-2 pr-6 text-[15px] font-semibold text-[#111111] transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 sm:w-auto focus:ring-offset-[#0B1220]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111111] text-white">
                <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </span>
              Book Demo
            </Link>
          </div>
        </LandingReveal>

        <div className="relative z-10 mx-auto mt-16 h-px w-full max-w-[920px] bg-white/10" aria-hidden />
      </div>
    </LandingSection>
  )
}
