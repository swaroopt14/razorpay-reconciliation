/**
 * CON-P1-11 — redact payout/support PII before external Slack delivery.
 * Full ticket content stays in the Zord support system of record only.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
/** UPI VPA: handle@psp (not a normal email TLD) */
const VPA_RE = /\b[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}\b/g
/** Indian bank UTR / common bank refs (12–22 alnum, often starting with UTR or digits) */
const UTR_RE = /\b(?:UTR[-\s]?)?[A-Z0-9]{12,22}\b/gi
/** Long digit runs typical of account numbers (9–18 digits); leave short amounts alone. */
const ACCOUNT_RE = /\b\d{9,18}\b/g
/** IFSC */
const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g
/** Phone-ish 10–13 digit with optional +91 */
const PHONE_RE = /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g

export type SlackRedactionClass =
  | 'email'
  | 'vpa'
  | 'utr'
  | 'account'
  | 'ifsc'
  | 'phone'
  | 'none'

export type SlackRedactionResult = {
  text: string
  classes: SlackRedactionClass[]
  redacted: boolean
}

function uniqueClasses(classes: SlackRedactionClass[]): SlackRedactionClass[] {
  return Array.from(new Set(classes.filter((c) => c !== 'none')))
}

/** Mask tenant id to a short non-reversible-looking reference for Slack. */
export function minimizeTenantRef(tenantId: string): string {
  const tid = tenantId.trim()
  if (!tid) return '—'
  if (tid.length <= 8) return `tenant…${tid.slice(-4)}`
  return `tenant…${tid.slice(0, 4)}…${tid.slice(-4)}`
}

/** Mask email for Slack contact line (keep domain shape only if needed). */
export function minimizeEmailRef(email: string | null | undefined): string {
  const value = email?.trim() || ''
  if (!value) return '—'
  const at = value.indexOf('@')
  if (at <= 0) return '[REDACTED_EMAIL]'
  const domain = value.slice(at + 1)
  return `c***@${domain || '***'}`
}

/**
 * Redact account numbers, VPA, email, UTR/IFSC/phone from free text destined for Slack.
 * Order: emails first (so VPA regex does not double-hit), then VPA, IFSC, UTR, phone, accounts.
 */
export function redactSupportTextForSlack(input: string, maxLen = 280): SlackRedactionResult {
  const classes: SlackRedactionClass[] = []
  let text = input ?? ''

  text = text.replace(EMAIL_RE, () => {
    classes.push('email')
    return '[REDACTED_EMAIL]'
  })

  text = text.replace(VPA_RE, (match) => {
    // Skip if already redacted token
    if (match.includes('[REDACTED')) return match
    // Skip email-like already handled; remaining @ are treated as VPA/handles
    if (/\.(com|net|org|io|co|in|ai)$/i.test(match.split('@')[1] || '')) {
      classes.push('email')
      return '[REDACTED_EMAIL]'
    }
    classes.push('vpa')
    return '[REDACTED_VPA]'
  })

  text = text.replace(IFSC_RE, () => {
    classes.push('ifsc')
    return '[REDACTED_IFSC]'
  })

  // Account digit runs before UTR so pure numeric accounts are not labeled as UTR.
  text = text.replace(ACCOUNT_RE, () => {
    classes.push('account')
    return '[REDACTED_ACCOUNT]'
  })

  text = text.replace(PHONE_RE, () => {
    classes.push('phone')
    return '[REDACTED_PHONE]'
  })

  text = text.replace(UTR_RE, (match) => {
    if (match.includes('REDACTED')) return match
    const hasUtrPrefix = /^UTR/i.test(match)
    // Mixed bank refs (letters + digits). Pure digit runs already handled as accounts.
    const mixedBankRef = /[A-Z]/i.test(match) && /\d/.test(match) && match.length >= 12
    if (!hasUtrPrefix && !mixedBankRef) return match
    classes.push('utr')
    return '[REDACTED_UTR]'
  })

  const trimmed = text.trim()
  const clipped = trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed
  const unique = uniqueClasses(classes)

  return {
    text: clipped,
    classes: unique.length ? unique : (['none'] as SlackRedactionClass[]),
    redacted: unique.length > 0,
  }
}

export function classificationLabel(classes: SlackRedactionClass[]): string {
  const meaningful = classes.filter((c) => c !== 'none')
  if (!meaningful.length) return 'classification: clear'
  return `classification: pii_redacted (${meaningful.join(', ')})`
}
