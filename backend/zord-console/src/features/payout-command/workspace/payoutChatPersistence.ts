/** Explicit opt-in only — stores a boolean, not chat content by itself. */
export const ASK_ZORD_PERSIST_OPT_IN_KEY = 'ask-zord-persist-approved'

/** CON-P1-12: device persistence is off unless the user explicitly enables it. */
export function isAskZordPersistApproved(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ASK_ZORD_PERSIST_OPT_IN_KEY) === '1'
  } catch {
    return false
  }
}

export function setAskZordPersistApprovedFlag(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage.setItem(ASK_ZORD_PERSIST_OPT_IN_KEY, '1')
    } else {
      window.localStorage.removeItem(ASK_ZORD_PERSIST_OPT_IN_KEY)
    }
  } catch {
    /* ignore */
  }
}
