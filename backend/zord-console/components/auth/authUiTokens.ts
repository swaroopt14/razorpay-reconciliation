/** Razorpay-inspired auth palette — light marketing panel + blue primary CTA. */
export const AUTH_UI = {
  primary: '#2B55E8',
  primaryHover: '#2348C9',
  marketingBg: '#F3F8FC',
  headline: '#0B4D3A',
  feature: '#1A7A5C',
  muted: '#64748B',
  border: '#D6E4F0',
  inputFocus: '#2B55E8',
} as const

export const authInputClass =
  'mt-1.5 block w-full rounded-lg border border-[#D6E4F0] bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2B55E8] focus:ring-2 focus:ring-[#2B55E8]/15'

export const authLabelClass = 'block text-[12px] font-semibold text-slate-700'

export const authPrimaryButtonClass =
  'w-full rounded-lg bg-[#2B55E8] py-2.5 text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(43,85,232,0.28)] transition hover:bg-[#2348C9] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none'

export const authOutlineButtonClass =
  'flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2.5 text-[14px] font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50'
