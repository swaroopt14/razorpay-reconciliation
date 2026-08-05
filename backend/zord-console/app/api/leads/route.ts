import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Demo / "Book a demo" lead-capture endpoint.
 *
 * Validates the payload, logs the lead, and pings the sales Slack channel via an
 * Incoming Webhook (set SLACK_LEADS_WEBHOOK_URL). There is no account/tenant created
 * here — provisioning happens later via /register once sales has qualified the lead.
 *
 * Slack delivery is best-effort: a webhook failure never fails the lead submission.
 */

const USE_CASE_LABELS: Record<string, string> = {
  payouts: 'Payouts & disbursement',
  reconciliation: 'Reconciliation & settlement',
  evidence: 'Compliance & audit evidence',
}

type NormalizedLead = {
  id: string
  receivedAt: string
  fullName: string
  workEmail: string
  companyName: string
  phone: string
  role: string | null
  useCases: string[]
  businessSector: string | null
  companyType: string | null
  country: string | null
  companySize: string | null
  monthlyVolume: string | null
  paymentPurpose: string | null
  currentStack: string | null
  goal: string | null
}

/** Post the lead to Slack via Incoming Webhook. Resolves to false on any failure. */
async function notifySlack(lead: NormalizedLead): Promise<boolean> {
  const webhook = process.env.SLACK_LEADS_WEBHOOK_URL?.trim()
  if (!webhook) return false

  const useCaseText = lead.useCases.length
    ? lead.useCases.map((id) => USE_CASE_LABELS[id] ?? id).join(', ')
    : '—'

  const fieldsLine = (label: string, value: string | null) =>
    `*${label}:* ${value && value.length ? value : '—'}`

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🚀 New Zord demo lead', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: fieldsLine('Name', lead.fullName) },
        { type: 'mrkdwn', text: fieldsLine('Company', lead.companyName) },
        { type: 'mrkdwn', text: fieldsLine('Email', lead.workEmail) },
        { type: 'mrkdwn', text: fieldsLine('Phone', lead.phone) },
        { type: 'mrkdwn', text: fieldsLine('Role', lead.role) },
        { type: 'mrkdwn', text: fieldsLine('Country', lead.country) },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Use cases:* ${useCaseText}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: fieldsLine('Sector', lead.businessSector) },
        { type: 'mrkdwn', text: fieldsLine('Company type', lead.companyType) },
        { type: 'mrkdwn', text: fieldsLine('Company size', lead.companySize) },
        { type: 'mrkdwn', text: fieldsLine('Monthly volume', lead.monthlyVolume) },
        { type: 'mrkdwn', text: fieldsLine('Payment purpose', lead.paymentPurpose) },
        { type: 'mrkdwn', text: fieldsLine('Pays today via', lead.currentStack) },
      ],
    },
  ]

  if (lead.goal) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Wants to improve:*\n>${lead.goal.replace(/\n/g, '\n>')}` },
    })
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Lead \`${lead.id}\` · ${lead.receivedAt}` }],
  })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `New Zord demo lead: ${lead.fullName} (${lead.companyName})`, blocks }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

type LeadPayload = {
  // Use case
  useCases?: string[]
  // Company
  companyName?: string
  businessSector?: string
  companyType?: string
  country?: string
  companySize?: string
  // Volume & needs
  monthlyVolume?: string
  paymentPurpose?: string
  currentStack?: string
  goal?: string
  // Contact
  fullName?: string
  workEmail?: string
  phoneCountryCode?: string
  phone?: string
  role?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  let body: LeadPayload
  try {
    body = (await request.json()) as LeadPayload
  } catch {
    return NextResponse.json(
      { code: 'INVALID_LEAD_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const fullName = asString(body.fullName)
  const workEmail = asString(body.workEmail).toLowerCase()
  const companyName = asString(body.companyName)
  const phone = asString(body.phone)

  const missing: string[] = []
  if (!fullName) missing.push('fullName')
  if (!companyName) missing.push('companyName')
  if (!workEmail) missing.push('workEmail')
  if (!phone) missing.push('phone')

  if (missing.length) {
    return NextResponse.json(
      { code: 'MISSING_FIELDS', message: `Missing required fields: ${missing.join(', ')}.` },
      { status: 400 },
    )
  }

  if (!EMAIL_RE.test(workEmail)) {
    return NextResponse.json(
      { code: 'INVALID_EMAIL', message: 'Enter a valid work email.' },
      { status: 400 },
    )
  }

  const leadId = `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  const lead: NormalizedLead = {
    id: leadId,
    receivedAt: new Date().toISOString(),
    fullName,
    workEmail,
    companyName,
    phone: `${asString(body.phoneCountryCode) || '+91'} ${phone}`,
    role: asString(body.role) || null,
    useCases: Array.isArray(body.useCases) ? body.useCases : [],
    businessSector: asString(body.businessSector) || null,
    companyType: asString(body.companyType) || null,
    country: asString(body.country) || null,
    companySize: asString(body.companySize) || null,
    monthlyVolume: asString(body.monthlyVolume) || null,
    paymentPurpose: asString(body.paymentPurpose) || null,
    currentStack: asString(body.currentStack) || null,
    goal: asString(body.goal) || null,
  }

  // Always log so the lead is never lost, even if Slack is unconfigured / down.
  console.info('[zord] new demo lead', JSON.stringify(lead))

  const slackDelivered = await notifySlack(lead)

  return NextResponse.json({ ok: true, id: leadId, slackDelivered }, { status: 201 })
}
