'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { PageHeroVisual } from '@/components/landing-final/FinalLandingPageScaffold'
import { SolutionBrowsePanel } from '@/components/landing-final/SolutionBrowsePanel'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'

const benefitCards = [
  {
    title: 'Use-case-first buyer story',
    body: 'Help product, risk, finance, and operations buyers immediately find the workflow they care about instead of starting from platform internals.',
  },
  {
    title: 'Product depth behind each solution',
    body: 'Every solution page maps directly to operational capabilities, proof, and rollout logic so the story feels concrete.',
  },
  {
    title: 'One design system across pages',
    body: 'The browse panel, hub page, and detail pages all stay inside the same ZORD visual language instead of feeling copied from another brand.',
  },
] as const

export default function SolutionsHubClient() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(198,239,207,0.10),transparent_20%),linear-gradient(180deg,#06080b_0%,#05070a_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:120px_120px]" />
      </div>

      <div className="relative z-10">
        <SolutionsSiteNav active="Solutions" />
        <FinalLandingAssistantButton />

        <main className="px-2 pb-20 pt-[150px] md:px-3">
          <section className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="max-w-4xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-[#c6efcf]" />
                Solutions
              </div>
              <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl lg:text-[4.7rem] lg:leading-[0.96]">
                Explore ZORD by the problem your team needs to solve next.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300/82 sm:text-xl">
                This is the Plaid-style solutions layer translated into the ZORD system: a clean browse experience by use case or workflow, with real destination pages behind every solution.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a
                  href="mailto:Support@zordnet.com?subject=Explore%20Zord%20solutions"
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition hover:bg-zinc-200"
                >
                  Talk to sales
                </a>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-[15px] font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  Back to landing page
                </Link>
              </div>
            </motion.div>

            <PageHeroVisual
              src="/final-landing/concepts/infrastructure-depth-system.png"
              alt="Layered financial infrastructure visual showing connected workflows and controlled system depth"
              eyebrow="Browse model"
              title="Start with the buyer problem, then map it to the workflow and product depth underneath."
              body="The solutions layer helps teams navigate from use case to operating model without losing the connection to rollout, proof, and system design."
              stats={[
                { value: '2', label: 'browse modes' },
                { value: '11', label: 'solution stories' },
                { value: '1', label: 'design system' },
              ]}
              imagePosition="right"
              imageClassName="object-cover object-center"
            />

            <div className="mt-12">
              <SolutionBrowsePanel />
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-6xl">
            <div className="grid gap-6 md:grid-cols-3">
              {benefitCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: index * 0.06 }}
                  className="rounded-[1.8rem] border border-white/10 p-8"
                  style={{
                    background:
                      index === 1
                        ? 'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.10), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.96) 0%, rgba(11,13,18,0.98) 100%)'
                        : 'linear-gradient(180deg, rgba(22,28,38,0.92) 0%, rgba(11,13,18,0.98) 100%)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Why this works</div>
                  <h2 className="mt-5 text-[1.8rem] font-semibold tracking-[-0.05em] text-white">{card.title}</h2>
                  <p className="mt-4 text-[15px] leading-7 text-slate-400">{card.body}</p>
                </motion.div>
              ))}
            </div>
          </section>
        </main>

        <SolutionsSiteFooter />
      </div>
    </div>
  )
}
