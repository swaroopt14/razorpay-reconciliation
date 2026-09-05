'use client'

import React from 'react'
import { useSessionManager } from '@/app/hooks/useSessionManager'
import { SessionWarningModal } from './SessionWarningModal'

export function SessionManager() {
  const { idleSecondsRemaining, showWarning, extendSession, forceLogout } = useSessionManager()

  return (
    <SessionWarningModal
      isOpen={showWarning}
      secondsRemaining={idleSecondsRemaining}
      onExtend={extendSession}
      onLogout={forceLogout}
    />
  )
}
