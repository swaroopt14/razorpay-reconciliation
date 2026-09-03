/**
 * Canonical 100-payout demo amounts (INR major units with decimals).
 * Batch intended total = ₹1,23,77,867.56 — realistic enterprise batch scale.
 * Shared by Action Contract, Dispatch, Settlement, Overview, Gaps, samples, and exports.
 */
export const DEMO_PAYOUT_AMOUNTS = [
  172_347.78, 62_711.14, 44_790.38, 193_549.44, 96_696.12, 90_439.34, 85_938.14, 68_567.09,
  192_494.95, 60_876.67, 180_085.83, 193_366.10, 152_820.13, 57_647.05, 162_188.62, 127_192.12,
  46_196.30, 45_784.09, 59_049.81, 84_988.87, 87_900.12, 144_513.47, 164_581.53, 45_106.96,
  156_116.67, 80_878.11, 188_248.95, 174_518.84, 185_198.32, 152_731.93, 126_693.38, 85_363.07,
  132_857.10, 161_933.91, 97_352.45, 207_641.77, 40_947.10, 197_132.07, 206_892.08, 72_744.38,
  184_536.94, 127_335.86, 110_236.55, 97_286.13, 71_876.69, 84_298.68, 198_105.09, 109_477.46,
  60_817.57, 58_852.71, 118_473.73, 59_676.95, 114_124.78, 215_544.14, 111_005.74, 164_936.03,
  94_514.47, 207_163.82, 48_618.61, 191_095.75, 134_977.97, 150_922.90, 65_512.80, 118_184.56,
  55_957.41, 154_205.77, 100_463.97, 211_788.57, 170_108.32, 168_007.25, 114_676.08, 159_460.62,
  79_518.51, 185_872.38, 54_038.09, 49_111.41, 176_881.16, 86_911.36, 200_092.71, 99_677.05,
  56_163.32, 217_168.36, 87_927.04, 60_566.61, 118_515.01, 97_307.31, 133_729.35, 171_570.77,
  212_765.55, 115_339.84, 73_366.17, 116_450.27, 113_354.80, 83_093.22, 178_731.38, 95_024.59,
  185_301.08, 181_507.59, 174_134.94, 54_421.59,
] as const

export const DEMO_PAYEE_LABELS = [
  'Apex Components Pvt Ltd', 'Northwind Supplies', 'Brightline Media', 'Summit Components',
  'Meridian Services', 'Local Tools Co', 'Horizon Logistics', 'Cedar Softwares', 'Pacific Packaging',
  'Vertex Alloys', 'Indigo Textiles', 'Orion Chemicals', 'Maple Print House', 'Nova Electrics',
  'Silverline Foods', 'Atlas Couriers', 'Prime Bearing Co', 'Eastgate Plastics', 'BluePeak Marketing',
  'Harbor Spare Parts', 'Redwood Trading', 'Titan Steelworks', 'Greenfield Agro', 'Sunrise Pharma',
  'Quantum IT Services', 'Pinnacle Engineering', 'Nimbus Cloud Tech', 'Cobalt Energy', 'Falcon Air Cargo',
  'Sterling Jewellers', 'Vanguard Consulting', 'Sapphire Hospitality', 'Crystal Analytics',
  'Ironclad Manufacturing', 'Golden Gate Exports', 'Silver Fern Foods', 'Emerald Textiles',
  'Ruby Mining Corp', 'Platinum Solutions', 'Diamond Precision', 'Ruby Software Labs',
  'Amber Health Sciences', 'Jade Garden Supplies', 'Coral Reef Shipping', 'Pearl Academy Services',
  'Opal Digital Media', 'Onyx Infrastructure', 'Sapphire Power Systems', 'Topaz Chemicals',
  'Amethyst Biosciences', 'Garnet Agriculture', 'Zircon Aerospace', 'Aquamarine Marine',
  'Turquoise Wellness', 'Lapis Education', 'Citrine Retail', 'Peridot Finance',
  'Spinel Construction', 'Almandine Networks', 'Rhodolite Telecom', 'Charoite Semiconductors',
  'Sphene Robotics', 'Kunzite Biotech', 'Taaffeite Optics', 'Musgravite Research',
  'Hsanite Geology', 'Grandidierite Mining', 'Painite Rare Metals', 'Jeremejevite Labs',
  'Australite Space', 'Roaldite Fuel Cells', 'Baksanite Materials', 'Carlsbergite Alloys',
  'Chaoite Nanotech', 'Eakisite Sensors', 'Kornerupine Precision', 'Linarite Ceramics',
  'Zunyite Glassworks', 'Edingtonite Plastics', 'Gerhardtite Polymers', 'Holdenite Fibers',
  'Euchroite Solar', 'Lazulite Wind Power', 'Vesuvianite Hydro', 'Chlorargyrite Batteries',
  'Adamite Clean Energy', 'Willemite Recycling', 'Awaruite Green Steel', 'Orpiment Pigments',
  'Realgar Paints', 'Stibnite Coatings', 'Cinnabar Inks', 'Galena Batteries',
  'Anglesite Wiring', 'Wulfenite Panels', 'Covellite Wiring', 'Enargite Electronics',
  'Bournonite Switches', 'Jamesonite Fuses', 'Boulangerite Circuits',
] as const

export function demoPayoutAmount(index: number): number {
  return DEMO_PAYOUT_AMOUNTS[index] ?? DEMO_PAYOUT_AMOUNTS[0]!
}

export function demoPayeeLabel(index: number): string {
  return DEMO_PAYEE_LABELS[index] ?? DEMO_PAYEE_LABELS[0]!
}

export function formatDemoInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function demoIntendedPaymentValue(): number {
  return DEMO_PAYOUT_AMOUNTS.reduce((s, n) => s + n, 0)
}

/**
 * India bulk-payout case study (100 instructions).
 * Funnel: 100 received → 99 sealed/dispatched (PAY-0020 blocked) → 88 settled → 83 proof-ready.
 */
export const DEMO_BLOCKED_INDEX = 19
export const DEMO_WAITING_INDICES = [2, 17, 23, 36, 48, 49, 58, 64, 74, 75, 99] as const
export const DEMO_SHORT_INDICES = [53, 81] as const
export const DEMO_RETURNED_INDEX = 14
export const DEMO_REVERSAL_INDEX = 20
export const DEMO_MISSING_REF_INDEX = 12
/** Dispatched attempts that failed once; still in the batch send, credit not yet observed. */
export const DEMO_RETRY_INDICES = [23, 48] as const

export function isDemoWaitingIndex(i: number): boolean {
  return (DEMO_WAITING_INDICES as readonly number[]).includes(i)
}

export function isDemoShortIndex(i: number): boolean {
  return (DEMO_SHORT_INDICES as readonly number[]).includes(i)
}

export function isDemoRetryIndex(i: number): boolean {
  return (DEMO_RETRY_INDICES as readonly number[]).includes(i)
}

/** PAY-0100 short observation (3% under sealed expected). */
export function demoShortObserved(index = 99): number {
  return Math.round(demoPayoutAmount(index) * 0.97 * 100) / 100
}

export function demoShortDelta(index = 99): number {
  return Math.round((demoPayoutAmount(index) - demoShortObserved(index)) * 100) / 100
}
