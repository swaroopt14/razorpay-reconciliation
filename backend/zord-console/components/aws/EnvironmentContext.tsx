'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Environment = 'sandbox' | 'production'

interface EnvironmentContextType {
  environment: Environment
  setEnvironment: (env: Environment) => void
}

const EnvironmentContext = createContext<EnvironmentContextType | undefined>(undefined)

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<Environment>('sandbox')

  useEffect(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('zord-environment')
    if (saved === 'sandbox' || saved === 'production') {
      setEnvironmentState(saved)
    }
  }, [])

  const setEnvironment = (env: Environment) => {
    setEnvironmentState(env)
    localStorage.setItem('zord-environment', env)
  }

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext)
  if (context === undefined) {
    throw new Error('useEnvironment must be used within EnvironmentProvider')
  }
  return context
}
