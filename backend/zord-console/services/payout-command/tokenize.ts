/**
 * Beneficiary tokenization — Stripe-style masking.
 *
 * Two display modes:
 *   - Short (table cell):    'J••• D•• · HDFC ••••4242'
 *   - Full  (drawer detail): 'John D•• · HDFC Bank XXXX4242'
 *
 * Plus a deterministic token generator so the same intent always tokenizes
 * to the same `ben_tok_*` value across page loads.
 */

const BULLET = '•' // •

function maskMiddle(word: string, leadingChars: number): string {
  if (word.length <= leadingChars) return word
  const lead = word.slice(0, leadingChars)
  const tail = BULLET.repeat(Math.max(2, Math.min(3, word.length - leadingChars)))
  return `${lead}${tail}`
}

/**
 * Short mask for table cells. Initials of name + bullets, last 4 of account.
 *   tokenizeBeneficiaryShort('John', 'Doe', '4242', 'HDFC Bank') →
 *     'J••• D•• · HDFC ••••4242'
 */
export function tokenizeBeneficiaryShort(
  firstName: string,
  lastName: string,
  accountLast4: string,
  bank: string,
): string {
  const first = maskMiddle(firstName, 1)
  const last = maskMiddle(lastName, 1)
  const bankShort = bank.replace(/\sBank$/i, '').trim()
  return `${first} ${last} · ${bankShort} ${BULLET.repeat(4)}${accountLast4}`
}

/**
 * Full mask for drawer headers. Full first name + last initial + masked account.
 *   tokenizeBeneficiaryFull('John', 'Doe', '4242', 'HDFC Bank') →
 *     'John D•• · HDFC Bank XXXX4242'
 */
export function tokenizeBeneficiaryFull(
  firstName: string,
  lastName: string,
  accountLast4: string,
  bank: string,
): string {
  const last = maskMiddle(lastName, 1)
  return `${firstName} ${last} · ${bank} XXXX${accountLast4}`
}

/**
 * Deterministic token from a seed string (typically the intent ID).
 * Same input → same `ben_tok_*` every time. Not cryptographically meaningful
 * for the demo — backend would issue real tokens.
 */
export function generateBenToken(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0 // Convert to 32-bit int.
  }
  // Stretch to ~9 chars of base-36 alphanumerics.
  const positive = Math.abs(hash).toString(36).padStart(6, '0').slice(0, 6)
  const extra = Math.abs(hash * 31).toString(36).slice(0, 3)
  return `ben_tok_${positive}${extra}`
}
