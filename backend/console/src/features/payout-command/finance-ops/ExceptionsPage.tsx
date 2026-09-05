'use client'

import { FinanceConsoleShell } from './FinanceConsoleShell'
import { ExceptionsSurface } from './ExceptionsSurface'

export function ExceptionsPage() {
  return (
    <FinanceConsoleShell activeDock="exceptions">
      <ExceptionsSurface />
    </FinanceConsoleShell>
  )
}
