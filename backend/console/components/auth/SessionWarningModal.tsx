'use client'

import React from 'react'

interface SessionWarningModalProps {
  isOpen: boolean
  secondsRemaining: number
  onExtend: () => void
  onLogout: () => void
}

export function SessionWarningModal({
  isOpen,
  secondsRemaining,
  onExtend,
  onLogout,
}: SessionWarningModalProps) {
  if (!isOpen) return null

  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60
  const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-zinc-100">Your session is about to expire</h2>
        <p className="mt-3 text-sm text-zinc-400">
          For your security, you will be signed out in{' '}
          <span className="font-mono font-bold text-red-400">{timeString}</span> due to inactivity.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onLogout}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            Sign out now
          </button>
          <button
            onClick={onExtend}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )
}
