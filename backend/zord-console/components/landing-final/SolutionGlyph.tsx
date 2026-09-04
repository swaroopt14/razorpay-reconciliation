import type { SolutionGlyphName } from '@/components/landing-final/solutions-data'

export function SolutionGlyph({ name, className = '' }: { name: SolutionGlyphName; className?: string }) {
  const base = `inline-block ${className}`

  switch (name) {
    case 'open-finance':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3.5 12h17M12 3.5c2.3 2.5 3.4 5.3 3.4 8.5s-1.1 6-3.4 8.5M12 3.5C9.7 6 8.6 8.8 8.6 12s1.1 6 3.4 8.5" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      )
    case 'fraud-risk':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3 5.5 5.7v5.7c0 5 2.7 7.9 6.5 10.1 3.8-2.2 6.5-5.1 6.5-10.1V5.7L12 3Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="m9.4 12.3 1.9 1.9 3.5-4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'identity':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8.7 11.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM16.3 10.3a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.8 19c.4-2.9 2.9-5 6.1-5s5.7 2.1 6 5M13.5 18.7c.3-2.2 2.2-3.8 4.7-3.8 1.2 0 2.3.3 3.2 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'compliance':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2.8 4.5 6v5.4c0 5.4 3.1 8.5 7.5 10.9 4.4-2.4 7.5-5.5 7.5-10.9V6L12 2.8Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 12.4h6M9 16h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'income':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7.5 14.5 11 11l2.4 2.4 3.1-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'inbound':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4.5v15M6.5 10 12 4.5 17.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'outbound':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4.5v15M6.5 14 12 19.5 17.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'personal-finance':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.4v5l3.2 1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'business-finance':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 19.5h14M7.5 16V9.5M12 16V6.5M16.5 16V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'wages':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2.8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 12h8M12 8.8v6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'billing':
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18.2 8.2A6.8 6.8 0 0 0 7 5.6M5.8 15.8A6.8 6.8 0 0 0 17 18.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M5.6 5.9v4.3h4.3M18.4 18.1v-4.3h-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return null
  }
}
