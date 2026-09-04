/** Primary Zord contact email for marketing, sales, and console support. */
export const ZORD_CONTACT_EMAIL = 'Support@zordnet.com'

export function zordMailto(subject?: string): string {
  if (!subject?.trim()) return `mailto:${ZORD_CONTACT_EMAIL}`
  return `mailto:${ZORD_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
