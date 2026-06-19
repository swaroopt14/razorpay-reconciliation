export function buildAmbiguityMixSegments({
  providerRefMissingRate = 0,
  ambiguityRate = 0,
  lowConfidenceRate = 0,
  avgAttachmentConfidence = 0,
} = {}) {
  const missing = Math.round(providerRefMissingRate * 1000) / 10
  const ambiguous = Math.round(ambiguityRate * 1000) / 10
  let lowConf = Math.round(lowConfidenceRate * 1000) / 10
  if (lowConfidenceRate <= 0) {
    lowConf = Math.max(0, Math.round((1 - avgAttachmentConfidence) * 1000) / 10 - ambiguous)
  }
  let highConf = 100 - missing - ambiguous - lowConf
  if (highConf < 0) highConf = 0

  const segments = []
  if (highConf > 0) segments.push({ name: 'High Confidence', pct: highConf })
  if (lowConf > 0) segments.push({ name: 'Low Confidence', pct: lowConf })
  if (ambiguous > 0) segments.push({ name: 'Ambiguous', pct: ambiguous })
  if (missing > 0) segments.push({ name: 'Missing Refs', pct: missing })

  return {
    ambiguity_mix_segments: segments,
    clearing_pct: Math.round(avgAttachmentConfidence * 1000) / 10,
  }
}
