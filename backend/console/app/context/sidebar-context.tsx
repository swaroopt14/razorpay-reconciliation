'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type SidebarContextValue = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const value = useMemo(() => ({ isOpen, setIsOpen }), [isOpen])
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const value = useContext(SidebarContext)
  if (value) return value
  return {
    isOpen: true,
    setIsOpen: () => {},
  }
}
