'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { SolutionGlyph } from '@/components/landing-final/SolutionGlyph'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'
import { solutionEntries, type SolutionItem } from '@/components/landing-final/solutions-data'

export function SolutionDetailClient({ solution }: { solution: SolutionItem }) {
  const relatedSolutions = solutionEntries.filter((entry) => entry.slug !== solution.slug).slice(0, 3)

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_80%_18%,rgba(198,239,207,0.08),transparent_22%),linear-gradient(180deg,#06080b_0%,#05070a_100%)]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:120px_120px]" />
      </div>

      <div className="relative z-10">
        <SolutionsSiteNav active="Solutions" />
        <FinalLandingAssistantButton />

        <main className="px-2 pb-20 pt-[150px] md:px-3">
          <section className="mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)] lg:items-end">
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
                <Link href="/#use-cases" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-400 transition hover:text-white">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M16 10H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="m9.5 5-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back to solutions
                </Link>

                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-[#c6efcf]" />
                  {solution.eyebrow}
                </div>

                <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl lg:text-[4.8rem] lg:leading-[0.95]">
                  {solution.heroTitle}
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300/82 sm:text-xl">{solution.heroBody}</p>
                <p className="mt-5 text-[15px] leading-7 text-slate-400">{solution.audience}</p>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                  <a
                    href="mailto:Support@zordnet.com?subject=Discuss%20solution%20fit%20for%20Zord"
                    className="inline-flex items-center justify-center rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition hover:bg-zinc-200"
                  >
                    Contact sales
                  </a>
                  <Link
                    href="/signin"
                    className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-[15px] font-semibold text-white transition hover:bg-white/[0.08]"
                  >
                    Sign in
                  </Link>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.08 }}
                className="rounded-[2rem] border border-white/10 p-6 sm:p-7"
                style={{
                  background: 'linear-gradient(180deg, rgba(22,28,38,0.95) 0%, rgba(10,12,18,0.98) 100%)',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] border border-[#cde7ff]/60 bg-[linear-gradient(180deg,rgba(219,242,255,0.92)_0%,rgba(232,240,255,0.78)_100%)] text-[#174a7a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <SolutionGlyph name={solution.icon} className="h-8 w-8" />
                </div>

                <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Outcome signals</div>
                <div className="mt-4 grid gap-3">
                  {solution.outcomes.map((outcome, index) => (
                    <div
                      key={outcome.label}
                      className="rounded-[1.2rem] border border-white/10 p-5"
                      style={{
                        background:
                          index === 0
                            ? 'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.10), transparent 28%), linear-gradient(180deg, rgba(26,32,45,0.98) 0%, rgba(14,17,24,0.98) 100%)'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                      }}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{outcome.label}</div>
                      <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{outcome.value}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-6xl">
            <div className="grid gap-6 md:grid-cols-3">
              {solution.pillars.map((pillar, index) => (
                <motion.div
                  key={pillar.title}
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
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Capability {index + 1}</div>
                  <h2 className="mt-5 text-[1.8rem] font-semibold tracking-[-0.05em] text-white">{pillar.title}</h2>
                  <p className="mt-4 text-[15px] leading-7 text-slate-400">{pillar.description}</p>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-6xl rounded-[2rem] border border-white/10 p-6 sm:p-8 lg:p-10" style={{ background: 'linear-gradient(180deg, rgba(22,28,38,0.95) 0%, rgba(10,12,18,0.98) 100%)', boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-[#7aa2ff]" />
                How it works
              </div>
              <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                The working model behind {solution.title.toLowerCase()}
              </h2>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {solution.workflow.map((step) => (
                <div key={step.step} className="rounded-[1.45rem] border border-white/10 bg-white/[0.03] p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.04] text-lg font-semibold text-white">
                    {step.step}
                  </div>
                  <h3 className="mt-5 text-[1.5rem] font-semibold tracking-[-0.04em] text-white">{step.title}</h3>
                  <p className="mt-4 text-[15px] leading-7 text-slate-400">{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-6xl rounded-[2rem] border border-white/10 p-6 sm:p-8 lg:p-10" style={{ background: 'linear-gradient(180deg, rgba(22,28,38,0.95) 0%, rgba(10,12,18,0.98) 100%)', boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.85fr)] lg:items-start">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Related products</div>
                <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                  The product surfaces teams usually pair with this solution
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-slate-400">
                  Solutions are the buyer story. Products are the concrete surfaces that make the workflow reliable in production.
                </p>
              </div>

              <div className="grid gap-3">
                {solution.relatedProducts.map((product) => (
                  <div key={product} className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-[15px] font-semibold text-slate-200">
                    {product}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto mt-16 max-w-6xl">
            <div className="grid gap-6 md:grid-cols-3">
              {relatedSolutions.map((related) => (
                <Link
                  key={related.slug}
                  href={`/final-landing/solutions/${related.slug}`}
                  className="rounded-[1.8rem] border border-white/10 p-8 transition hover:border-white/16 hover:bg-white/[0.03]"
                  style={{ background: 'linear-gradient(180deg, rgba(22,28,38,0.92) 0%, rgba(11,13,18,0.98) 100%)', boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-[#cde7ff]/60 bg-[linear-gradient(180deg,rgba(219,242,255,0.92)_0%,rgba(232,240,255,0.78)_100%)] text-[#174a7a]">
                    <SolutionGlyph name={related.icon} className="h-6 w-6" />
                  </div>
                  <div className="mt-5 text-[1.6rem] font-semibold tracking-[-0.04em] text-white">{related.title}</div>
                  <p className="mt-3 text-[14px] leading-7 text-slate-400">{related.shortDescription}</p>
                </Link>
              ))}
            </div>
          </section>
        </main>

        <SolutionsSiteFooter />
      </div>
    </div>
  )
}
