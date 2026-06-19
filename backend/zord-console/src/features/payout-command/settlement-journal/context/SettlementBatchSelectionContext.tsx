'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type SettlementBatchSelectionValue = {
  tenantId: string
  tenantReady: boolean
  selectedClientBatchId: string
  setSelectedClientBatchId: (id: string) => void
  journalEnabled: boolean
}

const SettlementBatchSelectionContext = createContext<SettlementBatchSelectionValue | null>(null)

export function SettlementBatchSelectionProvider({
  value,
  children,
}: {
  value: SettlementBatchSelectionValue
  children: ReactNode
}) {
  return (
    <SettlementBatchSelectionContext.Provider value={value}>{children}</SettlementBatchSelectionContext.Provider>
  )
}

export function useSettlementBatchSelection(): SettlementBatchSelectionValue {
  const ctx = useContext(SettlementBatchSelectionContext)
  if (!ctx) {
    throw new Error('useSettlementBatchSelection must be used within SettlementBatchSelectionProvider')
  }
  return ctx
}
