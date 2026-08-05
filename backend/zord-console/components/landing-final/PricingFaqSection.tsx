'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { landingPricingCopy } from '@/components/landing-final/copy/landingPagesCopy'

export function PricingFaqSection() {
  const shouldReduceMotion = useReducedMotion()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const faqs = landingPricingCopy.faqs

  return (
    <section id="pricing-faqs" className="mt-20 scroll-mt-28">
      <div className="mx-auto max-w-3xl text-center">
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]"
        >
          FAQs
        </motion.p>
        <motion.h2
          initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="mt-4 text-[2rem] font-semibold leading-[1.05] tracking-[-0.05em] text-[#111111] sm:text-[2.5rem]"
        >
          Commercial questions buyers{' '}
          <span className="text-[#047857]">actually ask</span>
        </motion.h2>
      </div>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mx-auto mt-10 max-w-3xl divide-y divide-black/[0.06] rounded-[1.75rem] border border-black/[0.06] bg-white px-5 sm:px-8"
      >
        {faqs.map((faq, index) => {
          const open = openFaq === index
          return (
            <div key={faq.question} className="py-5">
              <button
                type="button"
                onClick={() => setOpenFaq(open ? null : index)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
                aria-expanded={open}
              >
                <span className="text-[16px] font-semibold tracking-[-0.02em] text-[#111111] sm:text-[17px]">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#9CA3AF] transition-transform duration-200 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28 }}
                    className="overflow-hidden"
                  >
                    <p className="pt-3 text-[14px] leading-relaxed text-[#6B7280] sm:text-[15px]">{faq.answer}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}
      </motion.div>
    </section>
  )
}
