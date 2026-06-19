/** Ask Zord workspace — aligned with Home command center typography. */
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'

export const WORKSPACE_HERO_BG = 'bg-[#e8eef5]'
export const WORKSPACE_HERO_BORDER = 'border-slate-200/90'
export const WORKSPACE_TAB_ACTIVE = 'bg-[#d7e4f4] text-[#000000]'
export const WORKSPACE_TAB_INACTIVE = 'bg-[#f3f4f6] text-[#00239C]'
export const WORKSPACE_TEXT_PRIMARY = HOME_TITLE_BLACK
export const WORKSPACE_TEXT_MUTED = HOME_BODY_IMPERIAL_SM
export const WORKSPACE_TEXT_LABEL = COMMAND_CENTER_LABEL_GREEN
export const WORKSPACE_CARD = `${COMMAND_CENTER_KPI_CARD} !shadow-[0_10px_44px_rgba(15,23,42,0.07)]`
export const WORKSPACE_HERO_CARD = `${COMMAND_CENTER_KPI_CARD} flex min-h-[33.5rem] flex-col justify-between !p-6`
export const WORKSPACE_PANEL_SHELL =
  'flex min-h-[48rem] flex-col rounded-2xl border border-slate-100 bg-white p-4 text-[#000000] shadow-[0_10px_44px_rgba(15,23,42,0.07)] sm:p-5'
export const WORKSPACE_BAR_PRIMARY = '#00239C'
export const WORKSPACE_BAR_MUTED = '#aac1de'
export const WORKSPACE_COMPARE_MUTED = '#d8d8d3'
export const WORKSPACE_PAGE_BG = PAYOUT_PAGE_BG_CLASS
