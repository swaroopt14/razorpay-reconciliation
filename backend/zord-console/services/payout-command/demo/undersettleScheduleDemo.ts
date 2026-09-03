import type { PolicyRule } from './policyStudioDemo'
import { demoPayoutAmount } from './demoPayoutAmounts'
import { getStoredScenario, SCENARIO_CROSS_BORDER } from './scenarioMode'

/** Cross-border sandbox only — policy-authorised invoice cuts sealed on the PAC. */

export const UNDERSETTLE_PROMPT_ID = 'undersettle-abc' as const
export const UNDERSETTLE_POLICY_ID = 'POL-XB-HOLD'
export const UNDERSETTLE_PROMPT_SESSION_KEY = 'zord_xb_undersettle_prompt'

export const UNDERSETTLE_PROMPT_LABEL = 'Cross-border incomplete-order net settlement'

export const UNDERSETTLE_PROMPT = [
  'Draft a cross-border vendor settlement policy for incomplete order fulfilment.',
  'Limit the schedule to these sandbox counterparties: Company A Apex Components (PAY-0001), Company B Northwind Supplies (PAY-0002), and Company C Summit Components (PAY-0004).',
  'Where fulfilment is incomplete, deduct authorised withholding tax and commercial margin from the invoice and seal the resulting expected net on the Payment Action Contract.',
  'A bank credit that matches that sealed net is Exact. Authorised tax and margin are commercial terms, not settlement exceptions.',
  'Only an unexplained remainder versus sealed net is Short — in this mock, PAY-0002 (Northwind) remains ₹125 short after authorised deductions; PAY-0001 and PAY-0004 match the sealed net.',
].join(' ')

export function isCrossBorderUndersettleMock(): boolean {
  return getStoredScenario() === SCENARIO_CROSS_BORDER
}

const TAX_BPS = 1000
const MARGIN_BPS = 400

export type UndersettleCompanyCode = 'A' | 'B' | 'C'

export type UndersettleCompany = {
  code: UndersettleCompanyCode
  legalName: string
  payoutIndex: number
  taxBps: number
  marginBps: number
  orderRef: string
  reason: string
  /** Extra shortfall after authorised tax + margin, in major units. 0 = Exact. */
  unexplainedShort: number
}

export const UNDERSETTLE_COMPANIES: readonly UndersettleCompany[] = [
  {
    code: 'A',
    legalName: 'Apex Components Pvt Ltd',
    payoutIndex: 0,
    taxBps: TAX_BPS,
    marginBps: MARGIN_BPS,
    orderRef: 'PO-9901',
    reason:
      'Company A — Apex Components (PAY-0001). Fulfilment against PO-9901 is incomplete. Authorised withholding tax and commercial margin are deducted from the invoice and sealed as expected net. Observed credit matches that net (Exact).',
    unexplainedShort: 0,
  },
  {
    code: 'B',
    legalName: 'Northwind Supplies',
    payoutIndex: 1,
    taxBps: TAX_BPS,
    marginBps: MARGIN_BPS,
    orderRef: 'PO-9902',
    reason:
      'Company B — Northwind Supplies (PAY-0002). Delivery against PO-9902 is incomplete. Withholding tax and commercial margin are authorised. Observed credit is Short of sealed net by ₹125; that remainder is unexplained and belongs in Outcome Review.',
    unexplainedShort: 125,
  },
  {
    code: 'C',
    legalName: 'Summit Components',
    payoutIndex: 3,
    taxBps: TAX_BPS,
    marginBps: MARGIN_BPS,
    orderRef: 'PO-9904',
    reason:
      'Company C — Summit Components (PAY-0004). Fulfilment against PO-9904 is incomplete. Authorised withholding tax and commercial margin are deducted from the invoice and sealed as expected net. Observed credit matches that net (Exact).',
    unexplainedShort: 0,
  },
] as const

export type UndersettleBreakdown = {
  companyCode: UndersettleCompanyCode
  legalName: string
  policyId: string
  orderRef: string
  reason: string
  taxBps: number
  marginBps: number
  taxRateLabel: string
  marginRateLabel: string
  invoice: number
  tax: number
  margin: number
  expectedNet: number
  observed: number
  unexplained: number
  outcome: 'Exact' | 'Short'
  invoiceLabel: string
  taxLabel: string
  marginLabel: string
  expectedNetLabel: string
  observedLabel: string
  unexplainedLabel: string
}

function toMinor(major: number): number {
  return Math.round(major * 100)
}

function fromMinor(minor: number): number {
  return minor / 100
}

function applyBps(minor: number, bps: number): number {
  return Math.round((minor * bps) / 10_000)
}

export function formatUndersettleMoney(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function bpsLabel(bps: number): string {
  const pct = bps / 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}

function companyByIndex(index: number): UndersettleCompany | undefined {
  return UNDERSETTLE_COMPANIES.find((c) => c.payoutIndex === index)
}

function companyByName(name: string): UndersettleCompany | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return UNDERSETTLE_COMPANIES.find((c) => c.legalName.toLowerCase() === key)
}

export function isUndersettlePayee(name: string | null | undefined): boolean {
  return Boolean(name && companyByName(name))
}

function breakdownForCompany(
  company: UndersettleCompany,
  invoiceMajor: number,
): UndersettleBreakdown {
  const invoiceMinor = toMinor(invoiceMajor)
  const taxMinor = applyBps(invoiceMinor, company.taxBps)
  const marginMinor = applyBps(invoiceMinor, company.marginBps)
  const expectedNetMinor = invoiceMinor - taxMinor - marginMinor
  const unexplainedMinor = toMinor(company.unexplainedShort)
  const observedMinor = expectedNetMinor - unexplainedMinor
  const invoice = fromMinor(invoiceMinor)
  const tax = fromMinor(taxMinor)
  const margin = fromMinor(marginMinor)
  const expectedNet = fromMinor(expectedNetMinor)
  const observed = fromMinor(observedMinor)
  const unexplained = fromMinor(unexplainedMinor)
  return {
    companyCode: company.code,
    legalName: company.legalName,
    policyId: UNDERSETTLE_POLICY_ID,
    orderRef: company.orderRef,
    reason: company.reason,
    taxBps: company.taxBps,
    marginBps: company.marginBps,
    taxRateLabel: `WHT ${bpsLabel(company.taxBps)}`,
    marginRateLabel: `Holdback ${bpsLabel(company.marginBps)}`,
    invoice,
    tax,
    margin,
    expectedNet,
    observed,
    unexplained,
    outcome: unexplainedMinor > 0 ? 'Short' : 'Exact',
    invoiceLabel: formatUndersettleMoney(invoice),
    taxLabel: formatUndersettleMoney(tax),
    marginLabel: formatUndersettleMoney(margin),
    expectedNetLabel: formatUndersettleMoney(expectedNet),
    observedLabel: formatUndersettleMoney(observed),
    unexplainedLabel: formatUndersettleMoney(unexplained),
  }
}

export function undersettleBreakdownForIndex(index: number): UndersettleBreakdown | null {
  const company = companyByIndex(index)
  if (!company) return null
  return breakdownForCompany(company, demoPayoutAmount(index))
}

export function undersettleBreakdownForPayee(
  name: string | null | undefined,
  invoiceMajor?: number,
): UndersettleBreakdown | null {
  const company = name ? companyByName(name) : undefined
  if (!company) return null
  return breakdownForCompany(company, invoiceMajor ?? demoPayoutAmount(company.payoutIndex))
}

export const UNDERSETTLE_POLICY_RULES: PolicyRule[] = [
  {
    id: 'r-zord-undersettle-set',
    category: 'commercial',
    whenField: 'beneficiary_company',
    operator: 'is in',
    value: 'A,B,C',
    effect: 'allow',
    pattern:
      'When beneficiary is Apex Components, Northwind Supplies, or Summit Components and order fulfilment is incomplete → apply authorised withholding tax and commercial margin; seal expected net',
    businessLabel: 'Incomplete-order net settlement (Companies A, B, C)',
  },
  {
    id: 'r-zord-undersettle-tax',
    category: 'commercial',
    whenField: 'tax_withholding_schedule',
    operator: 'applies',
    value: 'true',
    effect: 'allow',
    pattern:
      'When the withholding-tax schedule applies → deduct the tax line from the invoice. Authorised tax is a sealed commercial term, not a settlement exception',
    businessLabel: 'Withhold tax line from invoice (10%)',
  },
  {
    id: 'r-zord-undersettle-margin',
    category: 'commercial',
    whenField: 'commercial_margin',
    operator: 'applies',
    value: 'true',
    effect: 'allow',
    pattern:
      'When commercial margin holdback applies → deduct margin from the invoice and seal expected net on the Payment Action Contract',
    businessLabel: 'Cut commercial margin from invoice (4%)',
  },
]

export function undersettleDraftSchedule() {
  return {
    policyId: UNDERSETTLE_POLICY_ID,
    taxBps: TAX_BPS,
    marginBps: MARGIN_BPS,
    companies: UNDERSETTLE_COMPANIES.map((c) => ({
      code: c.code,
      legalName: c.legalName,
      orderRef: c.orderRef,
    })),
  }
}
