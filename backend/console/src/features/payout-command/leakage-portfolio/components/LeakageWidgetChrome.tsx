'use client'

import type { LeakageWidgetId } from '../leakageWidgetLayout'

type LeakageWidgetChromeProps = {
  widgetId: LeakageWidgetId
  children: React.ReactNode
}

export function LeakageWidgetChrome({ widgetId, children }: LeakageWidgetChromeProps) {
  return (
    <div className="relative" data-widget-id={widgetId}>
      {children}
    </div>
  )
}
