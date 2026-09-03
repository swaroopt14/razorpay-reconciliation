/**
  * Status chrome — black only (no green / amber / red).
  * Use for badges, pills, dots, rails, and status banners across the console.
  */
export const STATUS_NAVY = '#0B1324'

/** Solid square/pill chip */
export const STATUS_SOLID = 'bg-[#0B1324] text-white'

/** Soft outlined chip (same meaning weight as solid, quieter) */
export const STATUS_SOFT =
    'border border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'

/** Inline status text */
export const STATUS_TEXT = 'text-[#0B1324]'

/** Progress / indicator dots */
export const STATUS_DOT = 'bg-[#0B1324]'

/** Left accent rail on cards/rows */
export const STATUS_RAIL = 'border-l-4 border-l-[#0B1324]'

/** Neutral status / alert shell (no semantic color) */
export const STATUS_BANNER =
    'border border-[#D8DEE9] bg-[#F7F8FB] text-[#0B1324]'

/** Equal-height solid chip used in tables and headers */
export const STATUS_CHIP =
    'inline-flex h-7 min-w-[5.5rem] items-center justify-center px-2 text-[11px] font-semibold bg-[#0B1324] text-white'

export function statusSolid(_variant?: string): string {
    return STATUS_SOLID
}

export function statusSoft(_variant?: string): string {
    return STATUS_SOFT
}
