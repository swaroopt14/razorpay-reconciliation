/** Ask Zord in-card chat — Claude/ChatGPT-style tokens scoped to the inner panel only. */

export const CHAT_CARD_INNER =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-black/10 bg-[#fbfbfc]'

export const CHAT_HEADER =
  'shrink-0 border-b border-black/8 px-4 py-4 sm:px-5'

export const CHAT_TRANSCRIPT =
  'min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5'

export const CHAT_COMPOSER_FOOTER =
  'shrink-0 border-t border-black/8 bg-[#fbfbfc] px-4 py-3 sm:px-5 sm:py-4'

export const CHAT_COMPOSER_SHELL =
  'flex items-end gap-2 rounded-[1.15rem] border border-black/10 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-[#00239C]/25 focus-within:ring-2 focus-within:ring-[#00239C]/10'

export const CHAT_USER_BUBBLE =
  'max-w-[min(78%,28rem)] rounded-[1.15rem] rounded-br-md bg-[#eef1f5] px-4 py-3 text-[15px] leading-relaxed text-[#111111]'

export const CHAT_SUGGESTION_CHIP =
  'rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:border-[#00239C]/30 hover:bg-[#f4f7fb] disabled:cursor-not-allowed disabled:opacity-50'

export const CHAT_HISTORY_BTN =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-black/10 bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-[#fafafa]'

export const CHAT_RECENT_CHIP =
  'max-w-[12rem] truncate rounded-full border border-black/8 bg-white px-2.5 py-1 text-[11px] font-medium text-[#334155] transition hover:border-[#00239C]/25 hover:bg-[#f4f7fb]'
