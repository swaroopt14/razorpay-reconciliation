'use client'

import Link from 'next/link'
import { Glyph } from '../shared'
import { SUPPORT_DOC_NAV, type SupportDocLink } from './supportDocLinks'
import { ZORD_SUPPORT_EMAIL, ZORD_SUPPORT_MAILTO } from './supportConstants'
import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'

function DocLinkRow({ link }: { link: SupportDocLink }) {
  const className =
    'group flex flex-col gap-0.5 rounded-lg px-2 py-2 transition hover:bg-white/80'
  const inner = (
    <>
      <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${HOME_TITLE_BLACK}`}>
        {link.label}
        {link.external ? <Glyph name="arrow-up-right" className="h-3 w-3 text-[#00239C]/80" /> : null}
      </span>
      <span className={`text-[12px] font-medium leading-snug text-[#00239C]/90`}>{link.description}</span>
    </>
  )

  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={link.href} className={className}>
      {inner}
    </Link>
  )
}

type SupportDocNavProps = {
  open: boolean
  onClose: () => void
}

/** Slide-over documentation panel (reference layout keeps main area list + thread). */
export function SupportDocNav({ open, onClose }: SupportDocNavProps) {
  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[70] bg-slate-900/25 backdrop-blur-[1px]"
        aria-label="Close documentation"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-[71] flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-[#f8fafc] shadow-2xl"
        aria-label="Zord documentation"
      >
        <div className="flex items-center justify-between border-b border-slate-200/90 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#000000]">Documentation</p>
            <p className={`mt-0.5 text-[17px] font-bold ${HOME_TITLE_BLACK}`}>Zord docs</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[22px] leading-none text-slate-500 hover:bg-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {SUPPORT_DOC_NAV.map((link) => (
            <DocLinkRow key={link.id} link={link} />
          ))}
        </nav>
        <div className="border-t border-slate-200/90 px-5 py-4">
          <p className={`text-[12px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>Prefer email?</p>
          <a
            href={ZORD_SUPPORT_MAILTO}
            className={`mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#00239C] underline underline-offset-2`}
          >
            {ZORD_SUPPORT_EMAIL}
            <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
          </a>
        </div>
      </aside>
    </>
  )
}
