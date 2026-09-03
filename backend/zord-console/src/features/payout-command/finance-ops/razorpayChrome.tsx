'use client'

import type { ReactNode } from 'react'

export const RZ_BLUE = '#528FF0'
export const RZ_PAGE = 'min-h-0 flex-1 overflow-y-auto bg-[#F5F6F8]'
export const RZ_WRAP = 'mx-auto w-full max-w-[1120px] px-5 py-6 sm:px-8'
export const RZ_CARD = 'rounded-[8px] border border-[#E6E8EB] bg-white'
export const RZ_LABEL = 'text-[13px] font-medium text-[#6B6B6B]'
export const RZ_MUTED = 'text-[13px] text-[#8F8F8F]'

export function InfoDot({ label }: { label: string }) {
  return (
    <span
      className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full border border-[#C8CDD4] text-[9px] font-semibold leading-none text-[#8F8F8F]"
      title={label}
      aria-label={label}
    >
      i
    </span>
  )
}

export function BlueChevron() {
  return (
    <svg className="h-4 w-4 text-[#528FF0]" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3.5 11 8l-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DateRangeSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="relative inline-flex items-center gap-1 text-[15px] font-medium text-[#1A1A1A]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-5 text-[15px] font-medium text-[#1A1A1A] outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-[#6B6B6B]" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </label>
  )
}

export function PageHeader({
  title,
  range,
  onRangeChange,
  rangeOptions,
  docsHref,
}: {
  title: string
  range: string
  onRangeChange: (value: string) => void
  rangeOptions: { value: string; label: string }[]
  docsHref: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">{title}</h1>
        <DateRangeSelect value={range} onChange={onRangeChange} options={rangeOptions} />
      </div>
      <a
        href={docsHref}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#528FF0] hover:underline"
      >
        Documentation
        <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M4 2H10V8M10 2 2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </a>
    </div>
  )
}

export function HeroAmountCard({
  label,
  amount,
  subtitle,
  info,
}: {
  label: string
  amount: string
  subtitle: string
  info: string
}) {
  return (
    <section className={`${RZ_CARD} px-6 py-5`}>
      <div className="flex items-center gap-1.5">
        <p className={RZ_LABEL}>{label}</p>
        <InfoDot label={info} />
      </div>
      <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em] text-[#1A1A1A] sm:text-[36px]">
        {amount}
      </p>
      <p className={`mt-2 ${RZ_MUTED}`}>{subtitle}</p>
    </section>
  )
}

export function MiniMetricCard({
  label,
  value,
  subtitle,
  info,
  warn,
  hrefLabel,
  onClick,
}: {
  label: string
  value: string
  subtitle: string
  info: string
  warn?: boolean
  hrefLabel?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className={RZ_LABEL}>{label}</p>
          {warn ? (
            <span className="text-[#E55353]" aria-hidden>
              {label === 'Failed' ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.8 13 12.2H1L7 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M7 5.6v3.2M7 10.6h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </span>
          ) : (
            <InfoDot label={info} />
          )}
        </div>
        {hrefLabel ? (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[#528FF0]">
            {hrefLabel}
            <BlueChevron />
          </span>
        ) : (
          <BlueChevron />
        )}
      </div>
      <p className="mt-3 text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[#1A1A1A]">{value}</p>
      <p className={`mt-1 ${RZ_MUTED}`}>{subtitle}</p>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${RZ_CARD} px-5 py-4 text-left transition hover:border-[#D5D8DE]`}>
        {inner}
      </button>
    )
  }
  return <div className={`${RZ_CARD} px-5 py-4`}>{inner}</div>
}

export function UnderlineTabs({
  items,
  active,
  onChange,
}: {
  items: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-6 border-b border-[#E6E8EB]">
      {items.map((item) => {
        const on = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`-mb-px border-b-2 pb-3 text-[14px] ${
              on
                ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
                : 'border-transparent font-medium text-[#6B6B6B] hover:text-[#1A1A1A]'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function PaymentsEmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <svg width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden>
        <rect x="8" y="10" width="56" height="36" rx="6" fill="#EEF4FF" stroke="#528FF0" strokeWidth="1.6" />
        <rect x="8" y="18" width="56" height="8" fill="#528FF0" opacity="0.85" />
        <circle cx="52" cy="36" r="10" fill="#528FF0" />
        <path d="M47.5 36.2 50.6 39.2 56.5 33" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="mt-5 text-[16px] font-semibold text-[#1A1A1A]">{title}</p>
      <p className="mt-1 max-w-[360px] text-[13px] leading-relaxed text-[#6B6B6B]">{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-[13px] font-medium text-[#528FF0] hover:underline"
        >
          {actionLabel} →
        </button>
      ) : null}
    </div>
  )
}

export function StatusBadge({ tone, children }: { tone: 'captured' | 'pending' | 'failed' | 'created'; children: ReactNode }) {
  const cls =
    tone === 'captured'
      ? 'bg-[#E8F8EE] text-[#147A3F]'
      : tone === 'failed'
        ? 'bg-[#FDECEC] text-[#C0372A]'
        : tone === 'pending'
          ? 'bg-[#FFF6E5] text-[#B36B00]'
          : 'bg-[#EEF4FF] text-[#2B6CB0]'
  return (
    <span className={`inline-flex h-6 items-center rounded-[4px] px-2 text-[11px] font-semibold capitalize ${cls}`}>
      {children}
    </span>
  )
}
