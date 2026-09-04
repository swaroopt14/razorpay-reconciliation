'use client'

import { useReducedMotion } from 'framer-motion'

import { SolutionGlyph } from '@/components/landing-final/SolutionGlyph'
import { solutionEntries } from '@/components/landing-final/solutions-data'

function demoHref(title: string) {
  return `mailto:Support@zordnet.com?subject=${encodeURIComponent(`Book demo - ${title}`)}`
}

function WorkflowPill({
  slug,
  eyebrow,
  title,
  shortDescription,
  icon,
  anchorId = false,
}: {
  slug: string
  eyebrow: string
  title: string
  shortDescription: string
  icon: (typeof solutionEntries)[number]['icon']
  anchorId?: boolean
}) {
  return (
    <a
      href={demoHref(title)}
      id={anchorId ? `solution-${slug}` : undefined}
      className="group inline-flex w-[min(100%,300px)] shrink-0 items-center gap-4 rounded-[1.25rem] border border-[#34D399]/20 bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(52,211,153,0.08)] transition duration-200 hover:border-[#34D399]/45 hover:shadow-[0_12px_32px_rgba(52,211,153,0.14)] sm:w-[340px] sm:px-5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8F8F5] text-[#059669] ring-1 ring-[#34D399]/25 transition group-hover:bg-[#34D399] group-hover:text-white">
        <SolutionGlyph name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#059669]">
          {eyebrow}
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold tracking-[-0.02em] text-[#111111] sm:text-[15px]">
          {title}
        </span>
        <span className="mt-1 block line-clamp-2 text-[12px] leading-5 text-[#6B7280] sm:text-[13px]">
          {shortDescription}
        </span>
      </span>
    </a>
  )
}

export function SolutionsWorkflowMarquee() {
  const shouldReduceMotion = useReducedMotion()
  const items = [...solutionEntries, ...solutionEntries]

  return (
    <div id="solutions-catalog" className="scroll-mt-28">
      <div className="mb-6 px-5 text-center md:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]">All workflows</p>
        <p className="mx-auto mt-2 max-w-2xl text-[15px] leading-relaxed text-[#6B7280]">
          Real payout use cases - hover to pause, click any card to book a demo.
        </p>
      </div>

      {shouldReduceMotion ? (
        <div className="flex flex-wrap justify-center gap-3 px-5 md:px-8">
          {solutionEntries.map((solution) => (
            <WorkflowPill
              key={solution.slug}
              slug={solution.slug}
              eyebrow={solution.eyebrow}
              title={solution.title}
              shortDescription={solution.shortDescription}
              icon={solution.icon}
              anchorId
            />
          ))}
        </div>
      ) : (
        <div className="solutions-marquee-root relative left-1/2 w-screen -translate-x-1/2 overflow-hidden py-3">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white via-white/80 to-transparent sm:w-28" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white via-white/80 to-transparent sm:w-28" />

          <div className="solutions-marquee-track gap-4 sm:gap-5">
            {items.map((solution, index) => (
              <WorkflowPill
                key={`${solution.slug}-${index}`}
                slug={solution.slug}
                eyebrow={solution.eyebrow}
                title={solution.title}
                shortDescription={solution.shortDescription}
                icon={solution.icon}
                anchorId={index < solutionEntries.length}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
