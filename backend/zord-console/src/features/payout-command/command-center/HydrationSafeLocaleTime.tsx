'use client'

import { useEffect, useState } from 'react'

const DEFAULT_LOCALE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
}

/** Renders locale time only after mount — avoids SSR/client clock drift hydration errors. */
export function HydrationSafeLocaleTime({
  date,
  locale = 'en-IN',
  options = DEFAULT_LOCALE_TIME,
}: {
  date: Date
  locale?: string
  options?: Intl.DateTimeFormatOptions
}) {
  const [label, setLabel] = useState('')
  const stamp = date.getTime()

  useEffect(() => {
    setLabel(new Date(stamp).toLocaleString(locale, options))
  }, [stamp, locale, options])

  if (!label) return null
  return <time dateTime={new Date(stamp).toISOString()}>{label}</time>
}
