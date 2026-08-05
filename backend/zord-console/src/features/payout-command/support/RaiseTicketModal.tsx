'use client'

import { useState } from 'react'
import { SUPPORT_TICKET_CATEGORIES } from './supportDocLinks'
import type { NewSupportTicketInput } from '@/services/payout-command/support/supportTickets'

type RaiseTicketModalProps = {
  onClose: () => void
  onSubmit: (input: NewSupportTicketInput) => void
}

const DRAWER_CATEGORIES = ['Integrations Support', 'Plugins'] as const

export function RaiseTicketModal({ onClose, onSubmit }: RaiseTicketModalProps) {
  const [category, setCategory] = useState<string>(DRAWER_CATEGORIES[0])
  const [description, setDescription] = useState(
    'I want to integrate payment gateway with my Shopify website. How do I go about it?',
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    if (description.trim().length < 20) {
      setError('Describe the issue in at least 20 characters so support can triage faster.')
      return
    }
    const matched = SUPPORT_TICKET_CATEGORIES.includes(category as (typeof SUPPORT_TICKET_CATEGORIES)[number])
      ? category
      : 'Integrations'
    setError(null)
    onSubmit({
      category: matched,
      topic: matched === 'Plugins' ? 'Plugins' : 'Others',
      description: description.trim(),
      priority: 'normal',
      contactEmail: 'ops.reviewer@zordnet.com',
      notifyByEmail: true,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="raise-ticket-title"
        className="relative z-[81] flex h-full w-full max-w-[420px] flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)]"
      >
        <header className="flex items-center gap-3 bg-[#0B1B4D] px-4 py-4 text-white">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/10"
            aria-label="Back"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 id="raise-ticket-title" className="text-[16px] font-semibold tracking-tight">
            Create support ticket
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap gap-2">
            {DRAWER_CATEGORIES.map((c) => {
              const active = category === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                    active
                      ? 'bg-[#E8EEF9] text-[#1E3A8A]'
                      : 'border border-[#D1D5DB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]'
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            className="mt-5 w-full resize-none rounded-lg border border-[#D1D5DB] px-3.5 py-3 text-[14px] leading-relaxed text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />

          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-5 text-[14px] font-medium text-[#475569] transition hover:bg-[#F1F5F9]"
          >
            <svg className="h-5 w-5 text-[#64748B]" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M10 13.5V4.5m0 0 3 3m-3-3-3 3M4 15.5h12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Click here to Upload file
          </button>

          {error ? <p className="mt-3 text-[13px] font-medium text-[#DC2626]">{error}</p> : null}
        </div>

        <div className="border-t border-[#E5E7EB] p-4">
          <button
            type="button"
            onClick={handleSubmit}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-[#2563EB] text-[15px] font-semibold text-white transition hover:bg-[#1D4ED8]"
          >
            Create support ticket
          </button>
        </div>
      </div>
    </div>
  )
}
