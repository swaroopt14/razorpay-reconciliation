'use client'

import { useState } from 'react'
import { SUPPORT_TICKET_CATEGORIES } from './supportDocLinks'
import { ZORD_SUPPORT_EMAIL } from './supportConstants'
import type { NewSupportTicketInput } from '@/services/payout-command/support/supportTickets'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'

type RaiseTicketModalProps = {
  onClose: () => void
  onSubmit: (input: NewSupportTicketInput) => void
}

export function RaiseTicketModal({ onClose, onSubmit }: RaiseTicketModalProps) {
  const [category, setCategory] = useState<string>(SUPPORT_TICKET_CATEGORIES[0])
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notifyByEmail, setNotifyByEmail] = useState(true)
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    if (!topic.trim()) {
      setError('Add a short subject for this request.')
      return
    }
    if (description.trim().length < 20) {
      setError('Describe the issue in at least 20 characters so support can triage faster.')
      return
    }
    const email = contactEmail.trim()
    if (notifyByEmail && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address for updates, or turn off email notifications.')
      return
    }
    setError(null)
    onSubmit({
      category,
      topic,
      description,
      priority,
      contactEmail: email || undefined,
      notifyByEmail: notifyByEmail && Boolean(email),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="raise-ticket-title"
        className="relative z-[81] w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="raise-ticket-title" className={`text-[1.25rem] font-bold tracking-tight ${HOME_TITLE_BLACK}`}>
              Raise new request
            </h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              In-console ticket + optional email updates. You can also write to {ZORD_SUPPORT_EMAIL}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[20px] leading-none text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#000000]">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-medium text-[#0f172a] focus:border-[#00239C] focus:outline-none focus:ring-2 focus:ring-[#00239C]/15"
            >
              {SUPPORT_TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#000000]">
              Subject
            </span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Delayed settlements for batch SET-2026-03-12"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-[#00239C] focus:outline-none focus:ring-2 focus:ring-[#00239C]/15"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#000000]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Include batch_id, tenant context, timestamps, and what you expected vs what happened."
              className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-medium leading-relaxed text-[#0f172a] placeholder:text-slate-400 focus:border-[#00239C] focus:outline-none focus:ring-2 focus:ring-[#00239C]/15"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#000000]">
              Your email
            </span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-[#00239C] focus:outline-none focus:ring-2 focus:ring-[#00239C]/15"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyByEmail}
                onChange={(e) => setNotifyByEmail(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-[#00239C]"
              />
              <span className={`text-[13px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>
                Email me when Zord replies (and CC {ZORD_SUPPORT_EMAIL} on urgent items)
              </span>
            </label>
          </label>

          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#000000]">
              Priority
            </legend>
            {(['normal', 'urgent'] as const).map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2 text-[14px] font-medium text-[#00239C]">
                <input
                  type="radio"
                  name="priority"
                  checked={priority === p}
                  onChange={() => setPriority(p)}
                  className="accent-[#00239C]"
                />
                {p === 'normal' ? 'Standard' : 'Urgent (production blocker)'}
              </label>
            ))}
          </fieldset>
        </div>

        {error ? <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-xl bg-[#0f172a] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-neutral-800"
          >
            Submit request
          </button>
        </div>

        <p className={`mt-4 border-t border-slate-100 pt-3 ${HOME_BODY_IMPERIAL}`}>
          Prefer email only? Write to{' '}
          <a href={`mailto:${ZORD_SUPPORT_EMAIL}`} className="font-semibold text-[#00239C] underline">
            {ZORD_SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  )
}
