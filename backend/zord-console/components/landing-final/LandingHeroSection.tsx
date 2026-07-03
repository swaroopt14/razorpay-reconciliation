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
        <div className="relative pt-10 pb-20 sm:pt-16 lg:px-20 text-center min-h-[600px] flex items-center justify-center">
          
          <div className="relative z-20 mx-auto max-w-4xl flex flex-col items-center">
            <motion.h1
              initial={initial} animate={animate} variants={variants}
              id="landing-hero-heading"
              className="text-[3.5rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-[5.5rem] lg:text-[6.5rem]"
            >
              <span className="block text-[#111111]">The command center</span>
              <span className="block text-[#111111]">for payment operations</span>
            </motion.h1>

            <motion.p
              initial={initial} animate={animate} variants={variants}
              className="mt-8 max-w-[760px] text-lg font-medium leading-relaxed text-[#111111]/60 sm:text-[1.15rem]"
            >
              Modern finance and ops teams trust Zord to capture payment intent, monitor connector performance, and reconcile settlements in real time. Eliminate blind spots and close books faster with continuous audit evidence.
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
                <div className="w-16 h-16 rounded-xl bg-[#111] text-white flex items-center justify-center font-bold text-xs p-2 text-center border-b-4 border-zord-blue-600">
                  ENTERPRISE<br/>READY
                </div>
                <div className="text-left">
                  <div className="text-2xl font-bold">100%</div>
                  <div className="text-sm font-medium text-black/60">Audit Match</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">Zero</div>
                <div className="text-sm font-medium text-black/60">Unexplained Gaps</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">Real-time</div>
                <div className="text-sm font-medium text-black/60">Reconciliation</div>
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
            className="absolute left-[2%] md:left-[calc(50%-450px)] lg:left-[calc(50%-550px)] top-[2%] lg:top-[5%] w-[200px] md:w-[240px] rounded-[1.25rem] bg-[#111] p-4 shadow-xl text-white hidden sm:block border border-white/10 z-10 pointer-events-none"
          >
            <div className="text-[11px] font-bold mb-4 text-left">Settlement Volume</div>
            <div className="flex items-end gap-1.5 h-16">
              {[4, 6, 3, 5, 8, 4, 7, 9, 3].map((h, i) => (
                <div key={i} className={`flex-1 rounded-sm ${i % 2 === 0 ? 'bg-[#DBF33C]' : 'bg-zord-blue-500'}`} style={{ height: `${h * 10}%` }} />
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 40, y: -20, rotate: 4 }} 
            animate={{ opacity: 1, x: 0, y: 0, rotate: 4 }} 
            transition={{ delay: 0.8, duration: 1 }}
            className="absolute right-[2%] md:right-[calc(50%-450px)] lg:right-[calc(50%-550px)] top-[12%] lg:top-[10%] w-[200px] md:w-[220px] rounded-[1.25rem] bg-white p-4 shadow-2xl border border-black/5 hidden sm:block text-left z-10 pointer-events-none"
          >
            <div className="font-bold text-sm mb-1 text-[#111]">Settlement Batch</div>
            <div className="text-[10px] text-black/50 mb-3 font-mono">ID: BATCH-9082</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[9px] text-black/50">Initiated</div>
                <div className="text-[11px] font-medium text-black">09:00 AM</div>
              </div>
              <div>
                <div className="text-[9px] text-black/50">Matched</div>
                <div className="text-[11px] font-medium text-black">09:02 AM</div>
              </div>
            </div>
            <div className="w-full bg-[#111] text-white text-[11px] font-medium text-center py-2 rounded-lg">
              Audit Pack Ready • $2.4M
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 40, rotate: -2 } as any} 
            animate={{ opacity: 1, y: 0, rotate: -2 } as any} 
            transition={{ delay: 1, duration: 1 } as any}
            className="absolute left-[2%] md:left-[calc(50%-400px)] lg:left-[calc(50%-500px)] bottom-[5%] lg:bottom-[10%] w-[180px] md:w-[200px] rounded-[1.25rem] bg-white p-5 shadow-2xl border border-black/5 hidden sm:block text-left border-l-4 border-l-[#DBF33C] z-10 pointer-events-none"
          >
            <div className="text-xs font-bold text-black mb-4">Connector Health</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2"><span className="text-xs">🟢</span> Razorpay</span>
                <span className="font-medium text-black/60">99.9%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2"><span className="text-xs">🟢</span> Stripe</span>
                <span className="font-medium text-black/60">99.8%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-2"><span className="text-xs">🟡</span> Cashfree</span>
                <span className="font-medium text-black/60">98.5%</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 40, rotate: 6 } as any} 
            animate={{ opacity: 1, y: 0, rotate: 6 } as any} 
            transition={{ delay: 1.2, duration: 1 } as any}
            className="absolute right-[2%] md:right-[calc(50%-420px)] lg:right-[calc(50%-520px)] bottom-[2%] lg:bottom-[5%] w-[220px] md:w-[260px] rounded-[1.25rem] bg-white p-4 shadow-2xl border border-black/5 hidden sm:block z-10 pointer-events-none"
          >
            <div className="grid grid-cols-4 gap-2">
              {/* Mocking connector logos with colored boxes */}
              <div className="h-8 rounded bg-[#635BFF] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">Stripe</div>
              <div className="h-8 rounded bg-[#0A2540] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">Adyen</div>
              <div className="h-8 rounded bg-white border border-gray-200 flex items-center justify-center text-[10px] font-bold text-[#02042B] shadow-sm">Razorpay</div>
              <div className="h-8 rounded bg-[#4C349C] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">Cashfree</div>
              <div className="h-8 rounded bg-[#0070BA] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">PayPal</div>
              <div className="h-8 rounded bg-[#000000] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">Apple</div>
              <div className="h-8 rounded bg-[#5A63F8] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">Checkout</div>
              <div className="h-8 rounded bg-[#00A1E0] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">Plaid</div>
            </div>
          </motion.div>

        </div>
      </motion.div>
    </section>
  )
}
