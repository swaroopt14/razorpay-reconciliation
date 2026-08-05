'use client'

import { useCallback } from 'react'

export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}) {
  const submit = useCallback(() => {
    if (disabled) return
    onSubmit()
  }, [disabled, onSubmit])

  return (
    <div className="p-3 sm:p-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
      <div
        className="flex items-end gap-2 rounded-[18px] p-2.5"
        style={{
          background: 'var(--glass-panel)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow-sm)',
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Message Zord…'}
          className="flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none"
          style={{
            color: 'var(--text)',
            minHeight: 44,
            maxHeight: 160,
          }}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="h-[42px] w-[42px] rounded-[14px] flex items-center justify-center transition-all"
          style={{
            background: disabled ? 'rgba(31,41,55,0.10)' : 'var(--cx-primary)',
            color: disabled ? 'rgba(31,41,55,0.45)' : '#fff',
            border: '1px solid rgba(31,41,55,0.10)',
            boxShadow: disabled ? 'none' : '0 10px 18px rgba(124,58,237,0.20)',
          }}
          aria-disabled={disabled ? true : undefined}
          aria-label="Send"
          title="Send (Enter)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L15 22l-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <span className="text-[11px]" style={{ color: 'var(--glass-item-disabled)' }}>
          Enter to send, Shift+Enter for newline
        </span>
        <span className="text-[11px] font-mono" style={{ color: 'var(--glass-item-disabled)' }}>
          LOCAL ONLY
        </span>
      </div>
    </div>
  )
}
