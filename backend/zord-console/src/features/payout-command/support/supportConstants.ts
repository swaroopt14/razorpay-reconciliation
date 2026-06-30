import { ZORD_CONTACT_EMAIL } from '@/config/contact'

/** Production support contact — used for mailto and ticket email copy. */
export const ZORD_SUPPORT_EMAIL = ZORD_CONTACT_EMAIL
export const ZORD_SUPPORT_MAILTO = `mailto:${ZORD_SUPPORT_EMAIL}?subject=${encodeURIComponent('Zord console — production support')}`

export function supportMailtoForTicket(ticketNumber: string, topic: string) {
  const subject = encodeURIComponent(`Re: #${ticketNumber} — ${topic}`)
  return `mailto:${ZORD_SUPPORT_EMAIL}?subject=${subject}`
}
