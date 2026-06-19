'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { intentJournalCopy } from '../copy/intentJournalCopy'

type IntentJournalExportMenuProps = {
  onExportIntents: () => void
  onExportReviewItems: () => void
  disabled?: boolean
  intentCount?: number
  reviewCount?: number
}

export function IntentJournalExportMenu({
  onExportIntents,
  onExportReviewItems,
  disabled,
  intentCount = 0,
  reviewCount = 0,
}: IntentJournalExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 260 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const syncMenuPosition = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const width = Math.max(rect.width, 280)
    const left = Math.min(rect.left, window.innerWidth - width - 12)
    setMenuPos({
      top: rect.bottom + 8,
      left: Math.max(12, left),
      width,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    syncMenuPosition()
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onReposition = () => syncMenuPosition()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, syncMenuPosition])

  const intentsDisabled = intentCount === 0
  const reviewDisabled = reviewCount === 0

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={intentJournalCopy.export.menuLabel}
            className="rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 200,
            }}
          >
            <button
              type="button"
              role="menuitem"
              disabled={intentsDisabled}
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              onClick={() => {
                if (intentsDisabled) return
                onExportIntents()
                setOpen(false)
              }}
            >
              {intentJournalCopy.export.intentReport}
              <span className="mt-0.5 block text-xs text-slate-500">
                {intentsDisabled
                  ? 'No payment intents in current view'
                  : `${intentCount.toLocaleString('en-IN')} row${intentCount === 1 ? '' : 's'} · CSV download`}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={reviewDisabled}
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              onClick={() => {
                if (reviewDisabled) return
                onExportReviewItems()
                setOpen(false)
              }}
            >
              {intentJournalCopy.export.reviewItems}
              <span className="mt-0.5 block text-xs text-slate-500">
                {reviewDisabled
                  ? 'No review items in current view'
                  : `${reviewCount.toLocaleString('en-IN')} row${reviewCount === 1 ? '' : 's'} · CSV download`}
              </span>
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitem"
              disabled
              className="block w-full cursor-not-allowed px-4 py-2.5 text-left text-sm text-slate-400"
            >
              {intentJournalCopy.export.dispatchReady}
              <span className="mt-0.5 block text-xs">{intentJournalCopy.export.dispatchNotAvailable}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled
              className="block w-full cursor-not-allowed px-4 py-2 pb-3 text-left text-sm text-slate-400"
            >
              {intentJournalCopy.export.auditSummary}
              <span className="mt-0.5 block text-xs">{intentJournalCopy.export.auditNotAvailable}</span>
            </button>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        {intentJournalCopy.export.menuLabel}
      </button>
      {menu}
    </div>
  )
}
