/**
 * Canonical 20-payout demo amounts (INR major units).
 * Batch intended total = ₹55,000 — matches smoke/API payroll batch scale used by Leakage.
 * Shared by Action Contract, Dispatch, Settlement, Overview, Gaps, samples, and exports.
 */
export const DEMO_PAYOUT_AMOUNTS = [
  5_500, 2_200, 5_600, 2_900, 2_400, 1_800, 2_600, 3_900, 900, 5_000, 1_700, 2_800, 1_400, 3_400,
  2_100, 1_300, 4_100, 1_100, 3_500, 800,
] as const

export const DEMO_PAYEE_LABELS = [
  'Apex Components Pvt Ltd',
  'Northwind Supplies',
  'Brightline Media',
  'Summit Components',
  'Meridian Services',
  'Local Tools Co',
  'Horizon Logistics',
  'Cedar Softwares',
  'Pacific Packaging',
  'Vertex Alloys',
  'Indigo Textiles',
  'Orion Chemicals',
  'Maple Print House',
  'Nova Electrics',
  'Silverline Foods',
  'Atlas Couriers',
  'Prime Bearing Co',
  'Eastgate Plastics',
  'BluePeak Marketing',
  'Harbor Spare Parts',
] as const

export function demoPayoutAmount(index: number): number {
  return DEMO_PAYOUT_AMOUNTS[index] ?? DEMO_PAYOUT_AMOUNTS[0]!
}

export function demoPayeeLabel(index: number): string {
  return DEMO_PAYEE_LABELS[index] ?? DEMO_PAYEE_LABELS[0]!
}

export function demoIntendedPaymentValue(): number {
  return DEMO_PAYOUT_AMOUNTS.reduce((s, n) => s + n, 0)
}

/** PAY-0019 short observation (3% under sealed expected). */
export function demoShortObserved(index = 18): number {
  return Math.round(demoPayoutAmount(index) * 0.97)
}

export function demoShortDelta(index = 18): number {
  return demoPayoutAmount(index) - demoShortObserved(index)
}
