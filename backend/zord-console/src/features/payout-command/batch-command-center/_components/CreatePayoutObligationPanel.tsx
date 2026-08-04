'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { postIntentBulkIngest } from '@/services/payout-command/batch-intake/postIntentBulkIngest'
import {
  postSettlementFileUpload,
  SETTLEMENT_FILE_ACCEPT,
} from '@/services/payout-command/batch-intake/postSettlementFileUpload'
import { parseUploadedSheet, type BatchRow } from '@/services/payout-command/batch-model'
import {
  markDemoIntentUploaded,
  markDemoSettlementUploaded,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import {
  API_REQUEST_PREVIEW,
  BUSINESS_REFERENCE_TYPES,
  CREATE_OBLIGATION_HEADER,
  CREATE_OBLIGATION_TABS,
  INGEST_SOURCE_TYPES,
  MAPPING_PROFILES,
  POLICY_PACKS,
  PSP_OPTIONS,
  SOURCE_CONNECTIONS,
  TENANT_TYPE_OPTIONS,
  buildValidationPreview,
  type CreateObligationTabId,
  type ValidationPreview,
} from '@/services/payout-command/demo/createPayoutObligationDemo'
import { BatchPortalUploadZone } from './portal/BatchPortalUploadZone'

const INTENT_FILE_ACCEPT =
  '.csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type CreatePayoutObligationPanelProps = {
  /** Active batch reference - required for settlement upload after intents exist. */
  batchId?: string
  onDraftIntentsCreated?: (payload: {
    batchId: string
    fileName: string
    parsedRows: BatchRow[]
  }) => void
  onSettlementUploaded?: (payload: {
    batchId: string
    fileName: string
    parsedRows: BatchRow[]
  }) => void
  /** When set from ?upload=1 parent scroll target. */
  uploadAnchorId?: string
}

type SingleForm = {
  obligationId: string
  payerEntity: string
  beneficiaryName: string
  beneficiaryAccount: string
  beneficiaryCountry: string
  amount: string
  currency: string
  settlementCurrency: string
  plannedDate: string
  purpose: string
  sourceSystem: string
  businessRefType: string
  businessRefId: string
  crossBorder: boolean
  fxQuoteSource: string
  fxQuoteId: string
  fxQuotedRate: string
  fxMaxSpread: string
  fxFeeCap: string
  fxNetReceipt: string
  fxQuoteExpiry: string
}

const EMPTY_SINGLE: SingleForm = {
  obligationId: '',
  payerEntity: 'Your company entity',
  beneficiaryName: '',
  beneficiaryAccount: '',
  beneficiaryCountry: 'IN',
  amount: '',
  currency: 'INR',
  settlementCurrency: 'INR',
  plannedDate: '',
  purpose: '',
  sourceSystem: 'Manual entry',
  businessRefType: 'Payroll reference',
  businessRefId: '',
  crossBorder: false,
  fxQuoteSource: '',
  fxQuoteId: '',
  fxQuotedRate: '',
  fxMaxSpread: '',
  fxFeeCap: '',
  fxNetReceipt: '',
  fxQuoteExpiry: '',
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0B1324] outline-none focus:border-[#2563EB]'

/**
  * Spec 7.4 - Create Payout Obligation (primary Batch Command Center surface).
  */
export function CreatePayoutObligationPanel({
  batchId = '',
  onDraftIntentsCreated,
  onSettlementUploaded,
  uploadAnchorId = 'batch-intake-step-1',
}: CreatePayoutObligationPanelProps) {
  const pathname = usePathname()
  const isSandboxRoute = pathname?.startsWith('/sandbox') ?? false
  const [tab, setTab] = useState<CreateObligationTabId>('upload')

  // Upload tab state
  const [sourceConnection, setSourceConnection] = useState<string>('tally-erp')
  const [mappingProfile, setMappingProfile] = useState<string>(MAPPING_PROFILES[0].id)
  const [policyPack, setPolicyPack] = useState<string>(POLICY_PACKS[0].id)
  const [psp, setPsp] = useState(() => process.env.NEXT_PUBLIC_ZORD_SETTLEMENT_PSP ?? 'razorpay')
  const [file, setFile] = useState<File | null>(null)
  const [settlementFile, setSettlementFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<BatchRow[]>([])
  const [preview, setPreview] = useState<ValidationPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [settlementBusy, setSettlementBusy] = useState(false)
  const [intentIngestOk, setIntentIngestOk] = useState(false)
  const [settlementIngestOk, setSettlementIngestOk] = useState(false)
  const [localBatchId, setLocalBatchId] = useState(batchId)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  /** Hidden Settings → request headers (Step 1 bulk-ingest). Defaults match current UI contract. */
  const [ingestSourceType, setIngestSourceType] = useState('CSV')
  const [forceReprocess, setForceReprocess] = useState(false)
  const [tenantType, setTenantType] = useState('')

  const effectiveBatchId = localBatchId.trim() || batchId.trim()
  const sourceSystemLabel =
    SOURCE_CONNECTIONS.find((s) => s.id === sourceConnection)?.label?.trim() || sourceConnection

  useEffect(() => {
    if (batchId.trim()) setLocalBatchId(batchId.trim())
  }, [batchId])

  // Single tab
  const [single, setSingle] = useState<SingleForm>(EMPTY_SINGLE)
  const showFx =
    single.crossBorder ||
    (single.settlementCurrency.trim() !== '' &&
      single.currency.trim() !== '' &&
      single.settlementCurrency.toUpperCase() !== single.currency.toUpperCase())

  const canCreateFromUpload = useMemo(() => {
    if (!file || !preview || parsing) return false
    return preview.missingRequiredFields === 0 && preview.rowsNeedingMapping === 0
  }, [file, parsing, preview])

  const intentJournalHref = useMemo(() => {
    const base = isSandboxRoute ? '/sandbox?dock=grid' : '/payout-command-view/today?dock=grid'
    if (!effectiveBatchId) return base
    return `${base}&batch_id=${encodeURIComponent(effectiveBatchId)}`
  }, [effectiveBatchId, isSandboxRoute])

  const settlementJournalHref = useMemo(() => {
    const base = '/settlement/journal?demo=sandbox'
    if (!effectiveBatchId) return base
    return `${base}&client_batch_id=${encodeURIComponent(effectiveBatchId)}`
  }, [effectiveBatchId])

  const onFileChosen = useCallback(async (f: File) => {
    setFile(f)
    setIntentIngestOk(false)
    setNotice(null)
    setParsing(true)
    try {
      const parsed = await parseUploadedSheet(f)
      setParsedRows(parsed)
      const sample = parsed.slice(0, 5).map((r) => ({
        obligationId: r.refId || '',
        beneficiary: r.beneficiary || '',
        amount: r.amount > 0 ? String(r.amount) : '',
        currency: 'INR',
        purpose: '',
      }))
      setPreview(
        buildValidationPreview({
          fileName: f.name,
          rowCount: parsed.length || (f.name.includes('issues') ? 20 : 20),
          sampleRows: sample,
        }),
      )
    } catch {
      setParsedRows([])
      setPreview(
        buildValidationPreview({
          fileName: f.name,
          rowCount: f.name.includes('issues') ? 20 : 20,
        }),
      )
      setNotice({
        tone: 'warn',
        text: 'Local parse limited - validation preview uses file name heuristics. You can still create draft intents.',
      })
    } finally {
      setParsing(false)
    }
  }, [])

  const validateAndCreate = useCallback(async () => {
    if (!file || !preview) return
    if (!canCreateFromUpload) {
      setNotice({
        tone: 'err',
        text: 'Never create intents silently from invalid rows. Fix mapping / required fields or download error rows first.',
      })
      return
    }
    const userBatchId = localBatchId.trim() || batchId.trim()
    if (forceReprocess && !userBatchId) {
      setNotice({
        tone: 'err',
        text: 'X-Zord-Force-Reprocess requires a Batch ID above.',
      })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      // Step 1 → POST /api/bulk-ingest (headers from hidden Settings)
      const result = await postIntentBulkIngest({
        file,
        sourceType: ingestSourceType.trim() || 'CSV',
        sourceSystem: sourceSystemLabel,
        optionalBatchId: userBatchId || undefined,
        forceReprocess,
        tenantType: tenantType.trim() || undefined,
      })
      if (!result.ok) {
        const detail = result.errorMessage?.trim() || `HTTP ${result.httpStatus}`
        const extra = result.responseText.trim().slice(0, 280)
        throw new Error(extra && !detail.includes(extra) ? `${detail} - ${extra}` : detail)
      }
      const createdBatchId = result.batchIdFromBody?.trim() || userBatchId
      if (!createdBatchId) throw new Error('Upload succeeded but no batch reference was returned.')
      setLocalBatchId(createdBatchId)
      setIntentIngestOk(true)
      markSandboxSetupStep('intent-ingest')
      markDemoIntentUploaded(createdBatchId)
      setNotice({
        tone: 'ok',
        text: `Draft intents created · batch ${createdBatchId}`,
      })
      onDraftIntentsCreated?.({
        batchId: createdBatchId,
        fileName: file.name,
        parsedRows: parsedRows.length ? parsedRows : [],
      })
    } catch (e) {
      setIntentIngestOk(false)
      setNotice({
        tone: 'err',
        text: e instanceof Error ? e.message : 'Unable to create draft intents.',
      })
    } finally {
      setBusy(false)
    }
  }, [
    batchId,
    canCreateFromUpload,
    file,
    forceReprocess,
    ingestSourceType,
    localBatchId,
    onDraftIntentsCreated,
    parsedRows,
    preview,
    sourceSystemLabel,
    tenantType,
  ])

  const uploadSettlement = useCallback(async () => {
    if (!settlementFile) return
    const bid = effectiveBatchId
    const pspVal = psp.trim() || 'razorpay'
    if (!bid) {
      setNotice({
        tone: 'err',
        text: 'Create draft intents first (or set a batch reference) before uploading settlement confirmation.',
      })
      return
    }
    setSettlementBusy(true)
    setNotice(null)
    try {
      let parsed: BatchRow[] = []
      try {
        parsed = await parseUploadedSheet(settlementFile)
      } catch {
        parsed = []
      }
      // Step 2 → POST /api/settlement/upload?psp&batch_id → outcome-engine /v1/settlement/upload
      // Headers: Batch-Id, X-Zord-Force-Reprocess, X-Zord-Force-Reprocess-Reason, Authorization via session/env
      const result = await postSettlementFileUpload({
        file: settlementFile,
        psp: pspVal,
        batchId: bid,
      })
      if (!result.ok) {
        const detail = result.errorMessage?.trim() || `HTTP ${result.httpStatus}`
        const extra = result.responseText.trim().slice(0, 400)
        const parts = [detail]
        if (extra && !detail.includes(extra)) parts.push(extra)
        if (result.httpStatus) parts.unshift(`[${result.httpStatus}]`)
        throw new Error(parts.join(' - '))
      }
      markSandboxSetupStep('settlement')
      markSandboxSetupStep('settlement-journal')
      markDemoSettlementUploaded(bid)
      setSettlementIngestOk(true)
      setNotice({
        tone: 'ok',
        text: `Settlement confirmation accepted for batch ${bid} · journals unlocked`,
      })
      onSettlementUploaded?.({ batchId: bid, fileName: settlementFile.name, parsedRows: parsed })
    } catch (e) {
      setSettlementIngestOk(false)
      setNotice({
        tone: 'err',
        text: e instanceof Error ? e.message : 'Settlement upload failed.',
      })
    } finally {
      setSettlementBusy(false)
    }
  }, [effectiveBatchId, onSettlementUploaded, psp, settlementFile])

  const downloadErrorRows = () => {
    if (!preview?.issues.length) return
    const csv = ['row,field,message', ...preview.issues.map((i) => `${i.row},${i.field},"${i.message}"`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'obligation-validation-errors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveSingleDraft = () => {
    const missing = [
      !single.obligationId && 'Obligation ID',
      !single.payerEntity && 'Payer entity',
      !single.beneficiaryName && 'Beneficiary',
      !single.amount && 'Amount',
      !single.currency && 'Currency',
      !single.plannedDate && 'Planned date',
      !single.purpose && 'Purpose',
      !single.sourceSystem && 'Source system',
    ].filter(Boolean)
    if (missing.length) {
      setNotice({ tone: 'err', text: `Missing required fields: ${missing.join(', ')}` })
      return
    }
    if (showFx && !single.fxQuoteSource) {
      setNotice({
        tone: 'err',
        text: 'Cross-border constraints require an external FX quote source - Zord is not the FX provider.',
      })
      return
    }
    setNotice({
      tone: 'ok',
      text: `Draft obligation ${single.obligationId} saved locally for review. Validate batch path for multi-row ingest.`,
    })
  }

  return (
    <section className="border border-[#E2E8F0] bg-white" aria-labelledby="create-obligation-title">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
        <div>
          <h1
            id="create-obligation-title"
            className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[#0B1324]"
          >
            {CREATE_OBLIGATION_HEADER.title}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#64748B]">{CREATE_OBLIGATION_HEADER.subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {CREATE_OBLIGATION_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 px-3.5 text-[13px] font-semibold ${
                tab === t.id
                  ? 'bg-[#0B1324] text-white'
                  : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#0B1324]'
              }`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center ${
              showAdvanced
                ? 'bg-[#0B1324] text-white'
                : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#0B1324]'
            }`}
            aria-expanded={showAdvanced}
            aria-label={showAdvanced ? 'Hide settings' : 'Open settings'}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M19.4 13.1c.04-.36.06-.73.06-1.1s-.02-.74-.06-1.1l2.04-1.59a.5.5 0 0 0 .12-.64l-1.93-3.34a.5.5 0 0 0-.6-.22l-2.4.96a8.2 8.2 0 0 0-1.9-1.1l-.36-2.54A.5.5 0 0 0 13.87 2h-3.74a.5.5 0 0 0-.5.43l-.36 2.54c-.68.27-1.32.64-1.9 1.1l-2.4-.96a.5.5 0 0 0-.6.22L2.44 8.67a.5.5 0 0 0 .12.64L4.6 10.9c-.04.36-.06.73-.06 1.1s.02.74.06 1.1l-2.04 1.59a.5.5 0 0 0-.12.64l1.93 3.34c.14.24.43.34.7.22l2.4-.96c.58.46 1.22.83 1.9 1.1l.36 2.54c.05.24.26.42.5.42h3.74c.24 0 .45-.18.5-.42l.36-2.54c.68-.27 1.32-.64 1.9-1.1l2.4.96c.27.12.56.02.7-.22l1.93-3.34a.5.5 0 0 0-.12-.64L19.4 13.1Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {showAdvanced ? (
        <div className="space-y-4 border-b border-[#E2E8F0] bg-[#FAFAFA] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
            Request headers & options
          </p>
          <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] uppercase tracking-[0.04em] text-[#64748B]">
                  <th className="px-3 py-2 font-semibold">Header</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#0B1324]">
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">x-zord-source-type</td>
                  <td className="px-3 py-2">
                    <select
                      className={inputClass}
                      value={ingestSourceType}
                      onChange={(e) => setIngestSourceType(e.target.value)}
                    >
                      {INGEST_SOURCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">x-zord-source-class</td>
                  <td className="px-3 py-2 font-mono text-[#64748B]">INTENT</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">X-Zord-Source-System</td>
                  <td className="px-3 py-2">
                    <select
                      className={inputClass}
                      value={sourceConnection}
                      onChange={(e) => setSourceConnection(e.target.value)}
                    >
                      {SOURCE_CONNECTIONS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">Batch-ID</td>
                  <td className="px-3 py-2 font-mono text-[#64748B]">
                    {effectiveBatchId || 'Not sent (empty) · from Batch ID field'}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">X-Zord-Force-Reprocess</td>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={forceReprocess}
                        onChange={(e) => setForceReprocess(e.target.checked)}
                        className="h-4 w-4 rounded border-[#CBD5E1]"
                      />
                      Reprocess this file
                      <span className="text-[11px] text-[#94A3B8]">(needs Batch ID)</span>
                    </label>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">Authorization</td>
                  <td className="px-3 py-2 text-[#64748B]">Omitted · session cookies</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-[11px]">x-zord-tenant-type</td>
                  <td className="px-3 py-2">
                    <select
                      className={inputClass}
                      value={tenantType}
                      onChange={(e) => setTenantType(e.target.value)}
                    >
                      {TENANT_TYPE_OPTIONS.map((t) => (
                        <option key={t.id || 'unset'} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mapping">
              <select
                className={inputClass}
                value={mappingProfile}
                onChange={(e) => setMappingProfile(e.target.value)}
              >
                {MAPPING_PROFILES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Policy">
              <select
                className={inputClass}
                value={policyPack}
                onChange={(e) => setPolicyPack(e.target.value)}
              >
                {POLICY_PACKS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PSP (Step 2)">
              <select className={inputClass} value={psp} onChange={(e) => setPsp(e.target.value)}>
                {PSP_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                {(PSP_OPTIONS as readonly string[]).includes(psp) ? null : (
                  <option value={psp}>{psp}</option>
                )}
              </select>
            </Field>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className={`border-b px-5 py-2.5 text-[13px] ${
            notice.tone === 'ok'
              ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
              : notice.tone === 'warn'
                ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
                : 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {tab === 'upload' ? (
        <div id={uploadAnchorId} className="scroll-mt-24 space-y-4 px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div
              id="batch-intake-step-1"
              className={`scroll-mt-24 rounded-xl border p-4 ${
                intentIngestOk ? 'border-black/30 bg-neutral-100/80' : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <p className="mb-2 text-[13px] font-semibold text-[#0B1324]">
                1 · Obligation file
                <span className="ml-2 font-normal text-[#94A3B8]">
                  {intentIngestOk ? 'Accepted' : parsing ? 'Reading…' : 'CSV / XLSX'}
                </span>
              </p>
              <BatchPortalUploadZone
                accept={INTENT_FILE_ACCEPT}
                busy={busy || parsing}
                selectedFileName={file?.name}
                hint="Drop file or browse"
                inputLabel="Choose obligation file"
                browseLabel="Choose file"
                busyLabel={parsing ? 'Reading…' : 'Creating…'}
                onFileChosen={(f) => void onFileChosen(f)}
              />
              {file ? (
                <button
                  type="button"
                  disabled={!canCreateFromUpload || busy || parsing}
                  onClick={() => void validateAndCreate()}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                >
                  {busy ? 'Creating…' : intentIngestOk ? 'Re-upload draft intents' : 'Create draft intents'}
                </button>
              ) : null}
              {intentIngestOk && effectiveBatchId ? (
                <Link
                  href={intentJournalHref}
                  className="mt-3 inline-flex text-[12px] font-semibold text-[#2563EB] underline"
                >
                  Open Intent Journal
                </Link>
              ) : null}
            </div>

            <div
              id="batch-intake-step-2"
              className={`scroll-mt-24 rounded-xl border p-4 ${
                settlementIngestOk
                  ? 'border-black/30 bg-neutral-100/80'
                  : effectiveBatchId
                    ? 'border-[#E2E8F0] bg-white'
                    : 'border-dashed border-[#E2E8F0] bg-[#FAFAFA]'
              }`}
            >
              <p className="mb-2 text-[13px] font-semibold text-[#0B1324]">
                2 · Settlement file
                <span className="ml-2 font-normal text-[#94A3B8]">
                  {settlementIngestOk ? 'Accepted' : effectiveBatchId ? 'Ready' : 'After step 1'}
                </span>
              </p>
              <BatchPortalUploadZone
                accept={SETTLEMENT_FILE_ACCEPT}
                busy={settlementBusy}
                disabled={!effectiveBatchId}
                selectedFileName={settlementFile?.name}
                hint="Drop file or browse"
                inputLabel="Choose settlement file"
                browseLabel="Choose file"
                onFileChosen={(f) => {
                  setSettlementFile(f)
                  setSettlementIngestOk(false)
                  setNotice(null)
                }}
              />
              {settlementFile ? (
                <button
                  type="button"
                  disabled={settlementBusy || !effectiveBatchId}
                  onClick={() => void uploadSettlement()}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                >
                  {settlementBusy
                    ? 'Uploading…'
                    : settlementIngestOk
                      ? 'Re-upload settlement'
                      : 'Upload settlement'}
                </button>
              ) : null}
              {settlementIngestOk && effectiveBatchId ? (
                <Link
                  href={settlementJournalHref}
                  className="mt-3 inline-flex text-[12px] font-semibold text-[#2563EB] underline"
                >
                  Open Settlement Journal
                </Link>
              ) : null}
            </div>
          </div>

          <div className="max-w-md">
            <Field label="Batch ID">
              <input
                className={`${inputClass} font-mono`}
                value={localBatchId}
                onChange={(e) => setLocalBatchId(e.target.value)}
                placeholder="Optional — Zord creates one on upload"
              />
            </Field>
          </div>

          {preview ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-[#E2E8F0] py-3 text-[13px] text-[#475569]">
                <span>
                  <span className="font-semibold tabular-nums text-[#0B1324]">{preview.rowsValid}</span> valid
                </span>
                {preview.duplicateCandidates > 0 ? (
                  <span>
                    <span className="font-semibold tabular-nums text-[#0B1324]">{preview.duplicateCandidates}</span>{' '}
                    duplicates
                  </span>
                ) : null}
                {preview.missingRequiredFields > 0 ? (
                  <span>
                    <span className="font-semibold tabular-nums text-[#0B1324]">{preview.missingRequiredFields}</span>{' '}
                    missing fields
                  </span>
                ) : null}
                {preview.rowsNeedingMapping > 0 ? (
                  <span>
                    <span className="font-semibold tabular-nums text-[#0B1324]">{preview.rowsNeedingMapping}</span>{' '}
                    need mapping
                  </span>
                ) : null}
              </div>

              <div className="overflow-x-auto border border-[#E2E8F0]">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                    <tr>
                      <th className="px-3 py-2">Obligation</th>
                      <th className="px-3 py-2">Beneficiary</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Currency</th>
                      <th className="px-3 py-2">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.map((r) => (
                      <tr key={r.obligationId} className="border-t border-[#E2E8F0]">
                        <td className="px-3 py-2 font-mono text-[#0B1324]">{r.obligationId}</td>
                        <td className="px-3 py-2">{r.beneficiary}</td>
                        <td className="px-3 py-2 tabular-nums">{r.amount}</td>
                        <td className="px-3 py-2">{r.currency}</td>
                        <td className="px-3 py-2">{r.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.issues.length > 0 ? (
                <ul className="space-y-1 border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3">
                  {preview.issues.map((i) => (
                    <li key={`${i.row}-${i.field}`} className="text-[12px] text-[#0B1324]">
                      Row {i.row} · {i.field} - {i.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}

          {preview?.issues.length ? (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={downloadErrorRows}
                className="text-[13px] font-semibold text-[#2563EB] hover:underline"
              >
                Download errors
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'single' ? (
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Obligation ID">
              <input
                className={inputClass}
                value={single.obligationId}
                onChange={(e) => setSingle((s) => ({ ...s, obligationId: e.target.value }))}
              />
            </Field>
            <Field label="Payer entity">
              <input
                className={inputClass}
                value={single.payerEntity}
                onChange={(e) => setSingle((s) => ({ ...s, payerEntity: e.target.value }))}
              />
            </Field>
            <Field label="Beneficiary · legal name">
              <input
                className={inputClass}
                value={single.beneficiaryName}
                onChange={(e) => setSingle((s) => ({ ...s, beneficiaryName: e.target.value }))}
              />
            </Field>
            <Field label="Beneficiary · masked account / wallet token">
              <input
                className={inputClass}
                value={single.beneficiaryAccount}
                onChange={(e) => setSingle((s) => ({ ...s, beneficiaryAccount: e.target.value }))}
                placeholder="····4821"
              />
            </Field>
            <Field label="Beneficiary · country">
              <input
                className={inputClass}
                value={single.beneficiaryCountry}
                onChange={(e) => setSingle((s) => ({ ...s, beneficiaryCountry: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <input
                className={inputClass}
                value={single.amount}
                onChange={(e) => setSingle((s) => ({ ...s, amount: e.target.value }))}
              />
            </Field>
            <Field label="Currency">
              <input
                className={inputClass}
                value={single.currency}
                onChange={(e) => setSingle((s) => ({ ...s, currency: e.target.value }))}
              />
            </Field>
            <Field label="Settlement currency">
              <input
                className={inputClass}
                value={single.settlementCurrency}
                onChange={(e) => setSingle((s) => ({ ...s, settlementCurrency: e.target.value }))}
              />
            </Field>
            <Field label="Planned date">
              <input
                type="date"
                className={inputClass}
                value={single.plannedDate}
                onChange={(e) => setSingle((s) => ({ ...s, plannedDate: e.target.value }))}
              />
            </Field>
            <Field label="Purpose">
              <input
                className={inputClass}
                value={single.purpose}
                onChange={(e) => setSingle((s) => ({ ...s, purpose: e.target.value }))}
              />
            </Field>
            <Field label="Source system">
              <input
                className={inputClass}
                value={single.sourceSystem}
                onChange={(e) => setSingle((s) => ({ ...s, sourceSystem: e.target.value }))}
              />
            </Field>
            <Field label="Business reference type">
              <select
                className={inputClass}
                value={single.businessRefType}
                onChange={(e) => setSingle((s) => ({ ...s, businessRefType: e.target.value }))}
              >
                {BUSINESS_REFERENCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Business reference ID">
              <input
                className={inputClass}
                value={single.businessRefId}
                onChange={(e) => setSingle((s) => ({ ...s, businessRefId: e.target.value }))}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-[13px] font-medium text-[#0B1324]">
            <input
              type="checkbox"
              checked={single.crossBorder}
              onChange={(e) => setSingle((s) => ({ ...s, crossBorder: e.target.checked }))}
              className="h-4 w-4"
            />
            Cross-border
          </label>

          {showFx ? (
            <div className="space-y-3 border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-4">
              <p className="text-[13px] font-semibold text-[#0B1324]">Cross-border panel</p>
              <p className="text-[12px] text-[#475569]">
                FX attributed to an external quote source - not Zord as FX provider. An expired quote blocks sealing, not
                file ingestion.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="FX quote source">
                  <input
                    className={inputClass}
                    value={single.fxQuoteSource}
                    onChange={(e) => setSingle((s) => ({ ...s, fxQuoteSource: e.target.value }))}
                    placeholder="e.g. Bank treasury desk"
                  />
                </Field>
                <Field label="Quote ID">
                  <input
                    className={inputClass}
                    value={single.fxQuoteId}
                    onChange={(e) => setSingle((s) => ({ ...s, fxQuoteId: e.target.value }))}
                  />
                </Field>
                <Field label="Quoted rate">
                  <input
                    className={inputClass}
                    value={single.fxQuotedRate}
                    onChange={(e) => setSingle((s) => ({ ...s, fxQuotedRate: e.target.value }))}
                  />
                </Field>
                <Field label="Maximum spread">
                  <input
                    className={inputClass}
                    value={single.fxMaxSpread}
                    onChange={(e) => setSingle((s) => ({ ...s, fxMaxSpread: e.target.value }))}
                  />
                </Field>
                <Field label="Fee cap">
                  <input
                    className={inputClass}
                    value={single.fxFeeCap}
                    onChange={(e) => setSingle((s) => ({ ...s, fxFeeCap: e.target.value }))}
                  />
                </Field>
                <Field label="Required net receipt">
                  <input
                    className={inputClass}
                    value={single.fxNetReceipt}
                    onChange={(e) => setSingle((s) => ({ ...s, fxNetReceipt: e.target.value }))}
                  />
                </Field>
                <Field label="Quote expiry">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={single.fxQuoteExpiry}
                    onChange={(e) => setSingle((s) => ({ ...s, fxQuoteExpiry: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={saveSingleDraft}
            className="inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
          >
            Validate and create draft intents
          </button>
        </div>
      ) : null}

      {tab === 'api' ? (
        <div className="space-y-4 px-5 py-5">
          <p className="text-[13px] text-[#475569]">
            API request preview - same nouns as Upload batch / Single payout. Credentials stay in Developer; never shown
            here after creation.
          </p>
          <pre className="overflow-x-auto border border-[#E2E8F0] bg-[#0B1324] p-4 text-[12px] leading-relaxed text-[#E2E8F0]">
            {API_REQUEST_PREVIEW}
          </pre>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(API_REQUEST_PREVIEW)
                setNotice({ tone: 'ok', text: 'API request preview copied.' })
              } catch {
                setNotice({ tone: 'warn', text: 'Could not copy - select the JSON manually.' })
              }
            }}
            className="inline-flex h-10 items-center border border-[#CBD5E1] bg-white px-4 text-[13px] font-semibold text-[#0B1324]"
          >
            Copy request body
          </button>
        </div>
      ) : null}
    </section>
  )
}
