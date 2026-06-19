import { Manrope } from 'next/font/google'
import { HOME_BODY_IMPERIAL_SM } from './homeCommandCenterTokens'

/** Manrope — same scale as Home / Workspace command center surfaces. */
export const homeManrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

export const HOME_MANROPE = homeManrope.className

/** Full Zord surface shell — Manrope + imperial blue body (matches HomeSurface). */
export const ZORD_SURFACE_CLASS = `${HOME_MANROPE} text-[13px] font-medium leading-relaxed tracking-[0] text-[#00239C] antialiased`

/** Supporting copy under section titles — imperial blue, medium weight. */
export const ZORD_SURFACE_MUTED = HOME_BODY_IMPERIAL_SM

/** Micro section labels on white cards. */
export const ZORD_SECTION_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.1em] text-[#000000]'
