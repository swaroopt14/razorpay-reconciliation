'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

export const LANDING_SECTION_SHELL = 'mx-auto w-full max-w-[1420px] px-6 sm:px-10 lg:px-12'

export const LIGHT_PRODUCT_SECTION = 'relative z-10 bg-[#F8F9FA] text-[#1A1A1A]'

export const LIGHT_FEATURE_CARD =
  'rounded-[1.5rem] border border-[#E5E7EB] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)]'

const SLOW_EASE = [0.22, 1, 0.36, 1] as const

type LandingSectionTheme = 'light' | 'dark'

const headerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.18, delayChildren: 0.08 },
  },
} as const

const fadeUpItem = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.25, ease: SLOW_EASE },
  },
} as const

type LandingSectionHeaderProps = {
  badge: string
  title: string
  titleAccent?: string
  description?: string
  theme?: LandingSectionTheme
  className?: string
  animated?: boolean
  inView?: boolean
}

/** Shared hero block - black badge, large title left, supporting copy right. */
export function LandingSectionHeader({
  badge,
  title,
  titleAccent,
  description,
  theme = 'light',
  className = '',
  animated = false,
  inView = true,
}: LandingSectionHeaderProps) {
  const shouldReduceMotion = useReducedMotion()
  const titleClass = theme === 'light' ? 'text-[#1A1A1A]' : 'text-white'
  const bodyClass = theme === 'light' ? 'text-[#4B5563]' : 'text-slate-400'

  const badgeEl = (
    <p className="mb-8 inline-flex w-fit rounded border border-[#111111] bg-[#111111] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white">
      {badge}
    </p>
  )

  const titleEl = (
    <h2
      className={`max-w-[15ch] text-[2.5rem] font-semibold leading-[0.94] tracking-[-0.04em] sm:text-[3.25rem] lg:text-[4.5rem] ${titleClass}`}
    >
      {titleAccent ? (
        <>
          {title}{' '}
          <span className="text-[#047857]">{titleAccent}</span>
        </>
      ) : (
        title
      )}
    </h2>
  )

  const bodyEl = description ? (
    <p className={`max-w-xl text-base font-medium leading-relaxed sm:text-lg lg:max-w-[30rem] lg:pt-1 ${bodyClass}`}>
      {description}
    </p>
  ) : null

  if (animated && !shouldReduceMotion) {
    return (
      <motion.div
        className={className}
        variants={headerContainer}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
      >
        <motion.div variants={fadeUpItem}>{badgeEl}</motion.div>
        <div
          className={
            description
              ? 'grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:gap-x-14 xl:gap-x-20'
              : 'max-w-4xl'
          }
        >
          <motion.div variants={fadeUpItem}>{titleEl}</motion.div>
          {bodyEl ? <motion.div variants={fadeUpItem}>{bodyEl}</motion.div> : null}
        </div>
      </motion.div>
    )
  }

  return (
    <div className={className}>
      {badgeEl}
      <div
        className={
          description
            ? 'grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:gap-x-14 xl:gap-x-20'
            : 'max-w-4xl'
        }
      >
        {titleEl}
        {bodyEl}
      </div>
    </div>
  )
}

type LandingSectionProps = {
  id?: string
  children: ReactNode
  className?: string
  shellClassName?: string
  'aria-label'?: string
}

export function LandingSection({ id, children, className = '', shellClassName = '', 'aria-label': ariaLabel }: LandingSectionProps) {
  return (
    <section id={id} aria-label={ariaLabel} className={className}>
      <div className={`${LANDING_SECTION_SHELL} ${shellClassName}`}>{children}</div>
    </section>
  )
}

export function LandingReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: SLOW_EASE }}
    >
      {children}
    </motion.div>
  )
}
