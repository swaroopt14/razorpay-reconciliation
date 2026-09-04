/** Live JSON may return numeric ids; never call `.trim()` on unknown API fields. */
export function apiTrimmedString(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}
