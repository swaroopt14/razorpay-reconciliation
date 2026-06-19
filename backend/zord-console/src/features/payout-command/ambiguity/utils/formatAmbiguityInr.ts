import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'

export function formatAmbiguityInr(minorStr: string | number | undefined): string {
  if (minorStr == null || minorStr === '') return '—'
  const minor = typeof minorStr === 'number' ? minorStr : Number(minorStr)
  if (!Number.isFinite(minor)) return '—'
  return fmtInrFromMinorExact(minor)
}
