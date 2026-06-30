import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentUser, clearAuth, SESSION_EXPIRED_EVENT, hasSessionHint } from '@/services/auth/authService'

export function useSessionManager() {
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState<number>(900) // Default 15 min
  const [absoluteSecondsRemaining, setAbsoluteSecondsRemaining] = useState<number>(28800) // Default 8 hr
  const [showWarning, setShowWarning] = useState<boolean>(false)
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)
  const lastActivityRef = useRef<number>(Date.now())

  const forceLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      clearAuth()
      if (typeof window !== 'undefined') {
        window.location.href = '/signin'
      }
    }
  }, [])

  const extendSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session/refresh', { method: 'POST' })
      if (response.ok) {
        lastActivityRef.current = Date.now()
        setShowWarning(false)
        broadcastChannelRef.current?.postMessage({ type: 'SESSION_EXTENDED' })
        // Poll status immediately to update local state
        await checkStatus()
      } else {
        await forceLogout()
      }
    } catch {
      await forceLogout()
    }
  }, [forceLogout])

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/auth/session/status')
      if (response.ok) {
        const data = await response.json()
        const now = Date.now()
        const idleExp = new Date(data.idle_expires_at).getTime()
        const absExp = new Date(data.absolute_expires_at).getTime()

        const idleSecs = Math.max(0, Math.floor((idleExp - now) / 1000))
        const absSecs = Math.max(0, Math.floor((absExp - now) / 1000))

        setIdleSecondsRemaining(idleSecs)
        setAbsoluteSecondsRemaining(absSecs)

        // Warn user at 13 minutes (2 minutes remaining)
        if (idleSecs <= 120 && idleSecs > 0) {
          setShowWarning(true)
        } else if (idleSecs <= 0 || absSecs <= 0) {
          await forceLogout()
        } else {
          setShowWarning(false)
        }
      } else {
        await forceLogout()
      }
    } catch {
      // Ignore network errors during background status checks, but keep local ticking
    }
  }

  useEffect(() => {
    // Use the session hint cookie as an eager signal — it is set server-side at
    // login and is immediately readable, unlike localStorage which is written
    // asynchronously by hydrateSession(). This prevents timers from being skipped
    // when this hook mounts before AuthSessionBootstrap has finished hydrating.
    const isLoggedIn = hasSessionHint() || getCurrentUser() !== null
    if (!isLoggedIn) return

    // Setup BroadcastChannel
    broadcastChannelRef.current = new BroadcastChannel('zord_session')
    broadcastChannelRef.current.onmessage = (event) => {
      if (event.data?.type === 'SESSION_EXTENDED') {
        lastActivityRef.current = Date.now()
        setShowWarning(false)
        checkStatus()
      } else if (event.data?.type === 'LOGOUT') {
        forceLogout()
      }
    }

    // Monitor activity
    const recordLocalActivity = () => {
      const now = Date.now()
      // Throttle activity recording to once every 45s
      if (now - lastActivityRef.current > 45000) {
        lastActivityRef.current = now
        // Extend session on the backend when client activity is detected
        extendSession()
      }
    }

    window.addEventListener('click', recordLocalActivity)
    window.addEventListener('keydown', recordLocalActivity)
    window.addEventListener('mousemove', recordLocalActivity)
    window.addEventListener('scroll', recordLocalActivity)
    window.addEventListener('touchstart', recordLocalActivity)

    // Poll status every 60 seconds
    const statusInterval = setInterval(checkStatus, 60000)
    // Run initial check
    checkStatus()

    // Local countdown timer (ticks every second)
    const countdownInterval = setInterval(() => {
      setIdleSecondsRemaining((prev) => {
        if (prev <= 1) {
          forceLogout()
          return 0
        }
        if (prev === 121) {
          setShowWarning(true)
        }
        return prev - 1
      })
      setAbsoluteSecondsRemaining((prev) => {
        if (prev <= 1) {
          forceLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Listen to global session expired events (e.g. from fetch interceptors)
    const handleExpiredEvent = () => {
      forceLogout()
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiredEvent)

    return () => {
      broadcastChannelRef.current?.close()
      window.removeEventListener('click', recordLocalActivity)
      window.removeEventListener('keydown', recordLocalActivity)
      window.removeEventListener('mousemove', recordLocalActivity)
      window.removeEventListener('scroll', recordLocalActivity)
      window.removeEventListener('touchstart', recordLocalActivity)
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiredEvent)
      clearInterval(statusInterval)
      clearInterval(countdownInterval)
    }
  }, [forceLogout])

  return {
    idleSecondsRemaining,
    absoluteSecondsRemaining,
    showWarning,
    extendSession,
    forceLogout,
  }
}
