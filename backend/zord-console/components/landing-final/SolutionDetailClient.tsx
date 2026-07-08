'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { SolutionGlyph } from '@/components/landing-final/SolutionGlyph'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'
import { solutionEntries, type SolutionItem } from '@/components/landing-final/solutions-data'

import { LandingMagneticBranch } from '@/components/landing-final/LandingMagneticBranch'
import { LandingHeroRocks } from '@/components/landing-final/LandingHeroRocks'
import { Leaf, Activity } from 'lucide-react'

function FloatingSpores() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {Array.from({ length: 10 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * 100 + '%', 
            y: Math.random() * 100 + '%',
            opacity: 0 
          }}
          animate={{ 
            y: [null, '-20%', '120%'],
            opacity: [0, 0.3, 0],
            scale: [0.6, 1.1, 0.6]
          }}
          transition={{ 
            duration: 15 + Math.random() * 25, 
            repeat: Infinity, 
            ease: "linear",
            delay: Math.random() * 10
          }}
          className="absolute h-1.5 w-1.5 rounded-full bg-[#34D399]/25 blur-[1.5px]"
        />
      ))}
    </div>
  )
}

export function SolutionDetailClient({ solution }: { solution: SolutionItem }) {
  const relatedSolutions = solutionEntries.filter((entry) => entry.slug !== solution.slug).slice(0, 3)
  const theme = 'light'
  const isLight = theme === 'light'

  return (
    <div className={`min-h-screen overflow-x-hidden ${isLight ? 'bg-[#FAFAFA] text-[#1A1A1A]' : 'bg-[#05070a] text-white'}`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {isLight ? (
           <>
             {/* Soft radial wash */}
             <div className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-[42%] rounded-full bg-[radial-gradient(circle,rgba(198,239,207,0.12)_0%,transparent_68%)]" />
             {/* Fine grid */}
             <div
               className="absolute inset-0 opacity-[0.2]"
               style={{
                 backgroundImage:
                   'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
                 backgroundSize: '72px 72px',
                 maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)',
                 WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)',
               }}
             />
           </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.13),transparent_32%),radial-gradient(circle_at_80%_18%,rgba(198,239,207,0.08),transparent_22%),linear-gradient(180deg,#06080b_0%,#05070a_100%)]" />
            <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:120px_120px]" />
          </>
        )}
      </div>

      <div className="relative z-10">
        <SolutionsSiteNav active="Solutions" theme={theme} scrollMorphTone="light" />
        <FinalLandingAssistantButton />

        {/* Floating Nature Effects */}
        <FloatingSpores />
        <LandingHeroRocks />

        <main className="px-2 pb-20 pt-[120px] md:px-3">
          <section className="mx-auto max-w-6xl">
            <div className="relative grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-center">
              {/* Background Fintech Image */}
              <div className="absolute -left-[10%] -top-[10%] z-0 h-[500px] w-[700px] opacity-[0.1] blur-[1px] pointer-events-none">
                <img 
                  src="/final-landing/solutions/fintech-payout-component-moss.png" 
                  alt="" 
                  className="h-full w-full object-contain"
                />
              </div>

              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
                <Link href="/final-landing/solutions" className={`inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider transition ${isLight ? 'text-[#4B5563] hover:text-[#111111]' : 'text-slate-400 hover:text-white'}`}>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M16 10H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="m9.5 5-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  All Solutions
                </Link>

                <div className={`mt-8 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLight ? 'border-black/5 bg-black/[0.03] text-[#4B5563]' : 'border-white/10 bg-white/[0.05] text-slate-300'}`}>
                  <Activity className="h-3 w-3 text-[#34D399]" />
                  <span>{solution.eyebrow}</span>
                </div>

                <h1 className={`mt-8 text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-[5.4rem] lg:leading-[0.92] ${isLight ? 'text-[#111111]' : 'text-white'}`}>
                  {solution.heroTitle.split(' ').map((word, i) => (
                    <span key={i} className={i === solution.heroTitle.split(' ').length - 1 ? 'text-[#34D399]' : ''}>
                      {word}{' '}
                    </span>
                  ))}
                </h1>
                <p className={`mt-8 max-w-3xl text-lg leading-relaxed text-[#4B5563] sm:text-xl`}>{solution.heroBody}</p>
                <div className="mt-6 flex items-center gap-4">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-[#E8F8F5] flex items-center justify-center">
                        <Activity className="h-4 w-4 text-[#224234]" />
                      </div>
                    ))}
                  </div>
                  <p className={`text-[14px] font-medium ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}>{solution.audience}</p>
                </div>

                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  <a
                    href="mailto:Support@zordnet.com?subject=Discuss%20solution%20fit%20for%20Zord"
                    className={`inline-flex items-center justify-center rounded-full px-8 py-4 text-[15px] font-semibold transition shadow-[0_12px_24px_rgba(0,0,0,0.12)] ${isLight ? 'bg-[#111111] text-white hover:bg-black/90' : 'bg-white text-black hover:bg-zinc-200'}`}
                  >
                    Discuss fit
                  </a>
                  <Link
                    href="/signin"
                    className={`inline-flex items-center justify-center rounded-full border px-8 py-4 text-[15px] font-semibold transition ${isLight ? 'border-black/10 bg-white text-[#111111] hover:bg-black/[0.02]' : 'border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]'}`}
                  >
                    View console
                  </Link>
                </div>
              </motion.div>

              <div className="relative">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.7, delay: 0.1 }}
                  className={`relative z-20 rounded-[2.5rem] border p-8 shadow-[0_32px_80px_rgba(0,0,0,0.06)] ${isLight ? 'border-black/5 bg-white' : 'border-white/10'}`}
                  style={!isLight ? { background: 'linear-gradient(180deg, rgba(22,28,38,0.95) 0%, rgba(10,12,18,0.98) 100%)' } : undefined}
                >
                  <div className={`flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-[#cde7ff]/60 shadow-sm ${isLight ? 'bg-[#E8F8F5] text-[#224234]' : 'bg-[linear-gradient(180deg,rgba(219,242,255,0.92)_0%,rgba(232,240,255,0.78)_100%)] text-[#174a7a]'}`}>
                    <SolutionGlyph name={solution.icon} className="h-8 w-8" />
                  </div>

                  <div className={`mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] ${isLight ? 'text-[#9CA3AF]' : 'text-slate-400'}`}>Outcome signals</div>
                  <div className="mt-6 grid gap-4">
                    {solution.outcomes.map((outcome, index) => (
                      <div
                        key={outcome.label}
                        className={`rounded-[1.4rem] border p-6 ${
                          isLight 
                            ? index === 0 ? 'border-[#34D399]/20 bg-[#E8F8F5]/30' : 'border-black/5 bg-[#FAFAFA]'
                            : index === 0 ? 'border-[#7aa2ff]/20 bg-[#7aa2ff]/10' : 'border-white/10 bg-white/5'
                        }`}
                      >
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}>{outcome.label}</div>
                        <div className={`mt-3 text-[2.4rem] font-semibold tracking-[-0.05em] ${isLight ? 'text-[#111111]' : 'text-white'}`}>{outcome.value}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Decorative branch behind the card */}
                <div className="pointer-events-none absolute -right-[15%] -top-[10%] z-10 opacity-30 lg:opacity-50">
                  <LandingMagneticBranch interactionEnabled={false} className="scale-75" />
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-24 max-w-6xl">
            <div className="grid gap-6 md:grid-cols-3">
              {solution.pillars.map((pillar, index) => (
                <motion.div
                  key={pillar.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className={`rounded-[2.2rem] border p-9 shadow-[0_24px_56px_rgba(0,0,0,0.04)] ${isLight ? 'border-black/5 bg-white' : 'border-white/10 bg-white/5'}`}
                >
                  <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-[#34D399]' : 'text-[#c6efcf]'}`}>0{index + 1}</div>
                  <h2 className={`mt-6 text-[1.9rem] font-semibold tracking-[-0.045em] leading-tight ${isLight ? 'text-[#111111]' : 'text-white'}`}>{pillar.title}</h2>
                  <p className={`mt-5 text-[15px] leading-relaxed ${isLight ? 'text-[#4B5563]' : 'text-slate-400'}`}>{pillar.description}</p>
                </motion.div>
              ))}
            </div>
          </section>

          <section className={`mx-auto mt-24 max-w-6xl rounded-[2.5rem] border p-8 sm:p-10 lg:p-12 shadow-[0_32px_80px_rgba(0,0,0,0.05)] relative overflow-hidden ${isLight ? 'border-black/5 bg-white' : 'border-white/10 bg-white/5'}`}>
            <div className="absolute right-0 top-0 h-full w-1/3 opacity-[0.05] pointer-events-none">
              <img 
                src="/final-landing/solutions/fintech-reconciliation-grid-moss.png" 
                alt="" 
                className="h-full w-full object-cover"
              />
            </div>
            <div className="max-w-3xl relative z-10">
              <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLight ? 'border-black/5 bg-black/[0.02] text-[#4B5563]' : 'border-white/10 bg-white/[0.05] text-slate-300'}`}>
                <span className={`h-2 w-2 rounded-full ${isLight ? 'bg-[#34D399]' : 'bg-[#c6efcf]'}`} />
                Operating Model
              </div>
              <h2 className={`mt-8 text-4xl font-semibold tracking-[-0.055em] md:text-5xl leading-tight ${isLight ? 'text-[#111111]' : 'text-white'}`}>
                The working model behind {solution.title.toLowerCase()}
              </h2>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {solution.workflow.map((step) => (
                <div key={step.step} className={`rounded-[1.8rem] border p-8 ${isLight ? 'border-black/5 bg-[#FAFAFA]' : 'border-white/10 bg-white/5'}`}>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-[1rem] border text-lg font-bold shadow-sm ${isLight ? 'border-black/5 bg-white text-[#111111]' : 'border-white/10 bg-black text-white'}`}>
                    {step.step}
                  </div>
                  <h3 className={`mt-6 text-[1.6rem] font-semibold tracking-[-0.04em] ${isLight ? 'text-[#111111]' : 'text-white'}`}>{step.title}</h3>
                  <p className={`mt-4 text-[15px] leading-relaxed ${isLight ? 'text-[#4B5563]' : 'text-slate-400'}`}>{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={`mx-auto mt-24 max-w-6xl rounded-[2.5rem] border p-8 sm:p-10 lg:p-14 overflow-hidden relative ${isLight ? 'border-black/5 bg-[#111111] text-white' : 'border-white/10 bg-white text-[#111111]'}`}>
            <div className={`absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.12),transparent_40%)]`} />
            <div className="relative z-10 grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isLight ? 'text-[#34D399]' : 'text-[#059669]'}`}>Related products</div>
                <h2 className={`mt-6 text-4xl font-semibold tracking-[-0.05em] md:text-5xl leading-tight ${isLight ? 'text-white' : 'text-[#111111]'}`}>
                  The product surfaces teams usually pair with this solution
                </h2>
                <p className={`mt-6 text-[16px] leading-relaxed ${isLight ? 'text-slate-400' : 'text-[#4B5563]'}`}>
                  Solutions are the narrative. Products are the concrete infrastructure surfaces that make the workflow reliable in production.
                </p>
              </div>

              <div className="grid gap-4">
                {solution.relatedProducts.map((product) => (
                  <div key={product} className={`rounded-[1.4rem] border px-6 py-5 text-[15px] font-semibold shadow-sm backdrop-blur-md ${isLight ? 'border-white/10 bg-white/[0.04] text-slate-200' : 'border-black/5 bg-black/[0.04] text-[#111111]'}`}>
                    {product}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto mt-24 max-w-6xl">
            <div className="mb-12">
              <h2 className={`text-2xl font-semibold tracking-[-0.03em] ${isLight ? 'text-[#111111]' : 'text-white'}`}>Continue exploring</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {relatedSolutions.map((related) => (
                <Link
                  key={related.slug}
                  href={`/final-landing/solutions/${related.slug}`}
                  className={`group rounded-[2.2rem] border p-9 transition-all hover:shadow-xl shadow-[0_24px_56px_rgba(0,0,0,0.03)] ${isLight ? 'border-black/5 bg-white hover:border-black/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-[1rem] border transition group-hover:scale-110 ${isLight ? 'border-black/5 bg-[#E8F8F5] text-[#224234]' : 'border-white/10 bg-white/10 text-white'}`}>
                    <SolutionGlyph name={related.icon} className="h-6 w-6" />
                  </div>
                  <div className={`mt-8 text-[1.75rem] font-semibold tracking-[-0.045em] leading-tight transition group-hover:text-[#34D399] ${isLight ? 'text-[#111111]' : 'text-white'}`}>{related.title}</div>
                  <p className={`mt-4 text-[14px] leading-relaxed ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}>{related.shortDescription}</p>
                </Link>
              ))}
            </div>
          </section>
        </main>

        <SolutionsSiteFooter theme={theme} />
      </div>
    </div>
  )
}
