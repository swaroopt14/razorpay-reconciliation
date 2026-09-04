'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type JournalBatchSelectionValue = {
  tenantId: string
  tenantReady: boolean
  selectedBatchId: string
  setSelectedBatchId: (id: string) => void
  journalEnabled: boolean
}

const JournalBatchSelectionContext = createContext<JournalBatchSelectionValue | null>(null)

export function JournalBatchSelectionProvider({
  value,
  children,
}: {
  value: JournalBatchSelectionValue
  children: ReactNode
}) {
  return (
    <JournalBatchSelectionContext.Provider value={value}>{children}</JournalBatchSelectionContext.Provider>
  )
}

export function useJournalBatchSelection(): JournalBatchSelectionValue {
  const ctx = useContext(JournalBatchSelectionContext)
  if (!ctx) {
    throw new Error('useJournalBatchSelection must be used within JournalBatchSelectionProvider')
  }
  return ctx
}
