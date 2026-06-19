'use client'

export function createPolling<T>(
  fetchFn: () => Promise<T>,
  shouldStop: (data: T) => boolean,
  interval: number = 3000
): (callback: (data: T) => void) => () => void {
  let timeoutId: NodeJS.Timeout | null = null
  let stopped = false

  const poll = async (callback: (data: T) => void) => {
    if (stopped) return

    try {
      const data = await fetchFn()
      callback(data)

      if (shouldStop(data)) {
        return
      }

      timeoutId = setTimeout(() => poll(callback), interval)
    } catch (error) {
      console.error('Polling error:', error)
      timeoutId = setTimeout(() => poll(callback), interval)
    }
  }

  return (callback: (data: T) => void) => {
    stopped = false
    poll(callback)

    return () => {
      stopped = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
  }
}
