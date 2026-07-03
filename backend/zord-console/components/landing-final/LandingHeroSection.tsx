'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'

const heroCopy = landingHomeCopy.hero.slides[0]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.32, delayChildren: 0.25 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
  },
}

const instantVisible = { opacity: 1, y: 0, scale: 1 }

export function LandingHeroSection() {
  const shouldReduceMotion = useReducedMotion()

  const motionInitial = shouldReduceMotion ? false : 'hidden';
  const textItemMotion: any = shouldReduceMotion
    ? { initial: instantVisible, animate: instantVisible }
    : { variants: itemVariants };

  const { initial, animate, variants } = textItemMotion;

  return (
    <section
      className="relative z-10 w-full overflow-hidden bg-white text-[#111111]"
      aria-labelledby="landing-hero-heading"
    >
      {/* Curved Lines Background Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
        <svg viewBox="0 0 1000 800" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M-100 200 C300 -100, 700 800, 1100 300" stroke="black" strokeWidth="1" fill="none" />
          <path d="M-100 600 C400 900, 600 -200, 1100 400" stroke="black" strokeWidth="1" fill="none" />
          <circle cx="200" cy="150" r="300" stroke="black" strokeWidth="1" fill="none" />
          <circle cx="850" cy="650" r="400" stroke="black" strokeWidth="1" fill="none" />
        </svg>
      </div>

      <motion.div
        variants={shouldReduceMotion ? undefined : containerVariants}
        initial={motionInitial}
        animate="visible"
        className="mx-auto max-w-[1400px] px-4 pt-32 pb-16 sm:px-8 relative z-10"
      >
        <div className="relative pt-10 pb-20 sm:pt-16 lg:px-20 text-center">
          
          <div className="relative z-10 mx-auto max-w-4xl flex flex-col items-center">
            <motion.h1
              initial={initial} animate={animate} variants={variants}
              id="landing-hero-heading"
              className="text-[3.5rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-[5.5rem] lg:text-[6.5rem]"
            >
              <span className="block text-[#111111]">Payment experts</span>
              <span className="block text-[#111111]">in Travel & Hospitality</span>
            </motion.h1>

            <motion.p
              initial={initial} animate={animate} variants={variants}
              className="mt-8 max-w-[760px] text-lg font-medium leading-relaxed text-[#111111]/60 sm:text-[1.15rem]"
            >
              Global travel and hospitality brands trust Zord for seamless pay-ins & pay-outs, multi-currency acceptance, and direct acquiring with key payment methods. Enhance customer experience, boost approvals, and eliminate intermediaries with our dynamic payment infrastructure.
            </motion.p>

            <motion.div
              initial={initial} animate={animate} variants={variants}
              className="mt-8 flex gap-2 items-center opacity-40"
            >
              <span className="w-2 h-2 rounded-full bg-black"></span>
              <span className="w-5 h-2 rounded-full bg-black"></span>
              <span className="w-2 h-2 rounded-full bg-black"></span>
              <span className="w-2 h-2 rounded-full bg-black"></span>
              <span className="w-2 h-2 rounded-full bg-black"></span>
              <span className="w-2 h-2 rounded-full bg-black"></span>
            </motion.div>

            <motion.div
              initial={initial} animate={animate} variants={variants}
              className="mt-16 w-full max-w-2xl flex flex-col sm:flex-row justify-between items-center gap-8 px-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#111] text-white flex items-center justify-center font-bold text-xs p-2 text-center border-b-4 border-red-500">
                  UK&apos;S TOP<br/>FINTECH
                </div>
                <div className="text-left">
                  <div className="text-2xl font-bold">200+</div>
                  <div className="text-sm font-medium text-black/60">Locations</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">1000+</div>
                <div className="text-sm font-medium text-black/60">Payment methods</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">150+</div>
                <div className="text-sm font-medium text-black/60">Currencies</div>
              </div>
            </motion.div>

            <motion.div
              initial={initial} animate={animate} variants={variants}
              className="mt-12"
            >
              <Link
                href="/signup"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[#DBF33C] px-8 py-4 text-[15px] font-semibold text-[#111] transition-transform hover:scale-105 shadow-sm"
              >
                Apply online now
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </div>

            <motion.div 
            initial={{ opacity: 0, x: -40, y: -20, rotate: -6 }} 
            animate={{ opacity: 1, x: 0, y: 0, rotate: -6 }} 
            transition={{ delay: 0.6, duration: 1 }}
            className="absolute left-[-2%] top-[5%] lg:left-[5%] xl:left-[2%] w-[240px] rounded-[1.25rem] bg-[#111] p-4 shadow-xl text-white hidden lg:block border border-white/10"
          >
            <div className="text-[11px] font-bold mb-4 text-left">Payments & Refunds</div>
            <div className="flex items-end gap-1.5 h-16">
              {[4, 6, 3, 5, 8, 4, 7, 9, 3].map((h, i) => (
                <div key={i} className={`flex-1 rounded-sm ${i % 2 === 0 ? 'bg-[#DBF33C]' : 'bg-purple-500'}`} style={{ height: `${h * 10}%` }} />
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 40, y: -20, rotate: 4 }} 
            animate={{ opacity: 1, x: 0, y: 0, rotate: 4 }} 
            transition={{ delay: 0.8, duration: 1 }}
            className="absolute right-[-2%] top-[10%] lg:right-[5%] xl:right-[2%] w-[220px] rounded-[1.25rem] bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-black/5 hidden lg:block text-left"
          >
            <div className="font-bold text-sm mb-1 text-[#111]">Wellness Club Hotel</div>
            <div className="text-yellow-400 text-xs mb-3">★★★</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[9px] text-black/50">Check In</div>
                <div className="text-[11px] font-medium text-black">Thu, Apr 20</div>
              </div>
              <div>
                <div className="text-[9px] text-black/50">Check out</div>
                <div className="text-[11px] font-medium text-black">Thu, Apr 24</div>
              </div>
            </div>
            <div className="w-full bg-[#111] text-white text-[11px] font-medium text-center py-2 rounded-lg">
              Book now • 210 EUR
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 40, rotate: -2 } as any} 
            animate={{ opacity: 1, y: 0, rotate: -2 } as any} 
            transition={{ delay: 1, duration: 1 } as any}
            className="absolute left-[-2%] bottom-[10%] lg:left-[5%] xl:left-[8%] w-[200px] rounded-[1.25rem] bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-black/5 hidden lg:block text-left border-l-4 border-l-[#DBF33C]"
          >
            <div className="text-xs font-bold text-black mb-4">Geo data</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2"><span className="text-base">🇮🇳</span> India</span>
                <span className="font-medium text-black/60">37.07%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2"><span className="text-base">🇲🇽</span> Mexico</span>
                <span className="font-medium text-black/60">19.02%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2"><span className="text-base">🇺🇸</span> US</span>
                <span className="font-medium text-black/60">16.65%</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 40, rotate: 6 } as any} 
            animate={{ opacity: 1, y: 0, rotate: 6 } as any} 
            transition={{ delay: 1.2, duration: 1 } as any}
            className="absolute right-[-2%] bottom-[5%] lg:right-[5%] xl:right-[10%] w-[260px] rounded-[1.25rem] bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-black/5 hidden lg:block"
          >
            <div className="grid grid-cols-4 gap-2">
              {/* Mocking payment method logos with colored boxes */}
              <div className="h-8 rounded bg-[#1A1F71] flex items-center justify-center text-[10px] font-bold text-white">VISA</div>
              <div className="h-8 rounded bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">SEPA</div>
              <div className="h-8 rounded bg-white border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-700">G Pay</div>
              <div className="h-8 rounded bg-amber-400 flex items-center justify-center text-[10px] font-bold text-black">Mercado</div>
              <div className="h-8 rounded bg-[#0070BA] flex items-center justify-center text-[10px] font-bold text-white">AMEX</div>
              <div className="h-8 rounded bg-[#00A1E0] flex items-center justify-center text-[10px] font-bold text-white">OXXO</div>
              <div className="h-8 rounded bg-black flex items-center justify-center text-[10px] font-bold text-white">Apple</div>
              <div className="h-8 rounded bg-red-600 flex items-center justify-center text-[10px] font-bold text-white">Master</div>
            </div>
          </motion.div>

        </div>
      </motion.div>
    </section>
  )
}
