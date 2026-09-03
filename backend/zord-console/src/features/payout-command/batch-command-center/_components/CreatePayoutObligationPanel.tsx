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
  ERP_POLL_CONNECTIONS,
  MAPPING_PROFILES,
  POLICY_PACKS,
  SOURCE_CONNECTIONS,
  buildValidationPreview,
  type CreateObligationTabId,
  type IntakeSourceMode,
  type ValidationPreview,
} from '@/services/payout-command/demo/createPayoutObligationDemo'
import {
  DEMO_PAYEE_LABELS,
  DEMO_PAYOUT_AMOUNTS,
} from '@/services/payout-command/demo/demoPayoutAmounts'
import { BatchPortalUploadZone } from './portal/BatchPortalUploadZone'
import {
  PollStatusBar,
  useProgressiveReveal,
} from '@/features/payout-command/shared/useProgressiveReveal'

const INTENT_FILE_ACCEPT =
  '.csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type ErpPollRow = {
  refId: string
  beneficiary: string
  amount: number
  currency: string
  purpose: string
}

const ERP_POLL_QUEUE: ErpPollRow[] = DEMO_PAYOUT_AMOUNTS.map((amount, i) => ({
  refId: `PAY-${String(i + 1).padStart(4, '0')}`,
  beneficiary: DEMO_PAYEE_LABELS[i] ?? `Payee ${i + 1}`,
  amount,
  currency: 'INR',
  purpose: 'Supplier payout',
}))

function erpRowsToCsvFile(rows: ErpPollRow[], connectionId: string): File {
  const header = 'obligation_id,beneficiary,amount,currency,purpose,source_system\n'
  const body = rows
    .map((r) => {
      const name = `"${r.beneficiary.replace(/"/g, '""')}"`
      return `${r.refId},${name},${r.amount},${r.currency},${r.purpose},${connectionId}`
    })
    .join('\n')
  return new File([header + body], `erp-poll-${connectionId}-batch.csv`, { type: 'text/csv' })
}

function erpRowsToBatchRows(rows: ErpPollRow[]): BatchRow[] {
  return rows.map((r) => ({
    refId: r.refId,
    amount: r.amount,
    beneficiary: r.beneficiary,
    status: 'Pending',
    stage: 'Intent',
    reason: '',
    time: '—',
    actionLabel: 'Review',
    provider: 'RazorpayX',
    dispatchId: '',
    bankReference: '',
    timeline: [],
  }))
}

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
  const [intakeMode, setIntakeMode] = useState<IntakeSourceMode>('file')
  const [erpConnection, setErpConnection] = useState<string>(ERP_POLL_CONNECTIONS[0].id)

  // Upload tab state
  const [sourceConnection, setSourceConnection] = useState<string>(SOURCE_CONNECTIONS[0].id)
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

  const effectiveBatchId = localBatchId.trim() || batchId.trim()

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

  const erpStream = useProgressiveReveal(ERP_POLL_QUEUE, {
    intervalMs: 650,
    autoStart: false,
    resetKey: `${intakeMode}:${erpConnection}`,
  })

  const intentJournalHref = useMemo(
    () => (isSandboxRoute ? '/sandbox?dock=grid' : '/payout-command-view/today?dock=grid'),
    [isSandboxRoute],
  )

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
    setBusy(true)
    setNotice(null)
    try {
      const result = await postIntentBulkIngest({
        file,
        sourceType: 'CSV',
        sourceSystem: sourceConnection,
        forceReprocess: false,
      })
      if (!result.ok) {
        throw new Error(result.errorMessage?.trim() || `HTTP ${result.httpStatus}`)
      }
      const createdBatchId = result.batchIdFromBody?.trim() || ''
      if (!createdBatchId) throw new Error('Upload succeeded but no batch reference was returned.')
      setLocalBatchId(createdBatchId)
      setIntentIngestOk(true)
      markSandboxSetupStep('intent-ingest')
      markDemoIntentUploaded(createdBatchId)
      setNotice({
        tone: 'ok',
        text: `Draft intents created · batch ${createdBatchId} · Intent Journal unlocked`,
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
  }, [canCreateFromUpload, file, onDraftIntentsCreated, parsedRows, preview, sourceConnection])

  const createFromErpPoll = useCallback(async () => {
    if (!erpStream.complete || erpStream.visible.length === 0) {
      setNotice({
        tone: 'err',
        text: 'Finish ERP polling before creating draft intents.',
      })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const pollFile = erpRowsToCsvFile(erpStream.visible, erpConnection)
      const result = await postIntentBulkIngest({
        file: pollFile,
        sourceType: 'CSV',
        sourceSystem: erpConnection,
        forceReprocess: false,
      })
      if (!result.ok) {
        throw new Error(result.errorMessage?.trim() || `HTTP ${result.httpStatus}`)
      }
      const createdBatchId = result.batchIdFromBody?.trim() || ''
      if (!createdBatchId) throw new Error('Upload succeeded but no batch reference was returned.')
      const rows = erpRowsToBatchRows(erpStream.visible)
      setFile(pollFile)
      setParsedRows(rows)
      setLocalBatchId(createdBatchId)
      setIntentIngestOk(true)
      setSourceConnection(erpConnection)
      markSandboxSetupStep('intent-ingest')
      markDemoIntentUploaded(createdBatchId)
      setNotice({
        tone: 'ok',
        text: `Draft intents created from ERP poll · batch ${createdBatchId} · ${rows.length} obligations · Intent Journal unlocked`,
      })
      onDraftIntentsCreated?.({
        batchId: createdBatchId,
        fileName: pollFile.name,
        parsedRows: rows,
      })
    } catch (e) {
      setIntentIngestOk(false)
      setNotice({
        tone: 'err',
        text: e instanceof Error ? e.message : 'Unable to create draft intents from ERP poll.',
      })
    } finally {
      setBusy(false)
    }
  }, [erpConnection, erpStream.complete, erpStream.visible, onDraftIntentsCreated])

  const uploadSettlement = useCallback(async () => {
    if (!settlementFile) return
    const bid = effectiveBatchId
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
      const result = await postSettlementFileUpload({
        file: settlementFile,
        psp: psp.trim() || 'razorpay',
        batchId: bid,
      })
      if (!result.ok) {
        throw new Error(result.errorMessage?.trim() || `HTTP ${result.httpStatus}`)
      }
      markSandboxSetupStep('settlement')
      markSandboxSetupStep('settlement-journal')
      markDemoSettlementUploaded(bid)
      setSettlementIngestOk(true)
      setNotice({
        tone: 'ok',
        text: `Settlement confirmation accepted for batch ${bid} · Settlement Journal unlocked`,
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
        <div className="flex">
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
        </div>
      </header>

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
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              Obligation source
            </p>
            <div className="flex overflow-hidden rounded-md border border-[#D8DEE9]">
              {(
                [
                  { id: 'file' as const, label: 'File upload' },
                  { id: 'erp-poll' as const, label: 'Poll from ERP' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setIntakeMode(mode.id)
                    setNotice(null)
                  }}
                  className={`h-9 px-3.5 text-[12px] font-semibold ${
                    intakeMode === mode.id
                      ? 'bg-[#0B1324] text-white'
                      : 'bg-white text-[#64748B] hover:text-[#0B1324]'
                  }`}
                  aria-pressed={intakeMode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div
              id="batch-intake-step-1"
              className={`scroll-mt-24 rounded-xl border p-4 ${
                intentIngestOk ? 'border-black/30 bg-neutral-100/80' : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <p className="mb-2 text-[13px] font-semibold text-[#0B1324]">
                1 · Obligation intake
                <span className="ml-2 font-normal text-[#94A3B8]">
                  {intentIngestOk
                    ? 'Accepted'
                    : intakeMode === 'erp-poll'
                      ? erpStream.polling
                        ? 'Polling ERP…'
                        : erpStream.complete
                          ? 'Poll complete'
                          : 'ERP API poll'
                      : parsing
                        ? 'Reading…'
                        : 'CSV / XLSX'}
                </span>
              </p>

              {intakeMode === 'file' ? (
                <>
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
                </>
              ) : (
                <div className="space-y-3">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                      ERP connection
                    </span>
                    <select
                      className={inputClass}
                      value={erpConnection}
                      onChange={(e) => setErpConnection(e.target.value)}
                      disabled={erpStream.polling || busy}
                    >
                      {ERP_POLL_CONNECTIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} · {c.transport}
                        </option>
                      ))}
                    </select>
                  </label>

                  <PollStatusBar
                    label="ERP obligation poll"
                    visibleCount={erpStream.visibleCount}
                    total={erpStream.total}
                    polling={erpStream.polling}
                    complete={erpStream.complete}
                    onStart={erpStream.start}
                    onStop={erpStream.stop}
                    startLabel="Start polling ERP"
                    idleHint="Same pattern as Signal Mesh — obligations arrive one by one"
                  />

                  <div className="max-h-56 overflow-auto rounded-lg border border-[#E2E8F0]">
                    <table className="min-w-full text-left text-[12px]">
                      <thead className="sticky top-0 border-b border-[#E2E8F0] bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Ref</th>
                          <th className="px-3 py-2">Beneficiary</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {erpStream.visible.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-[#94A3B8]">
                              {erpStream.polling
                                ? 'Waiting for first ERP obligation…'
                                : 'Start polling to pull obligations one by one.'}
                            </td>
                          </tr>
                        ) : (
                          erpStream.visible.map((row, idx) => (
                            <tr
                              key={row.refId}
                              className={`border-b border-[#F1F5F9] ${
                                idx === erpStream.visible.length - 1 && erpStream.polling
                                  ? 'bg-[#F8FAFC]'
                                  : ''
                              }`}
                            >
                              <td className="px-3 py-1.5 tabular-nums text-[#94A3B8]">{idx + 1}</td>
                              <td className="px-3 py-1.5 font-semibold text-[#0B1324]">{row.refId}</td>
                              <td className="max-w-[140px] truncate px-3 py-1.5 text-[#64748B]">
                                {row.beneficiary}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#0B1324]">
                                ₹{row.amount.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    disabled={!erpStream.complete || busy}
                    onClick={() => void createFromErpPoll()}
                    className="inline-flex h-10 w-full items-center justify-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                  >
                    {busy
                      ? 'Creating…'
                      : intentIngestOk
                        ? 'Re-create draft intents from poll'
                        : `Create draft intents (${erpStream.visibleCount}/20)`}
                  </button>
                </div>
              )}

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

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[12px] font-semibold text-[#64748B] hover:text-[#0B1324]"
            >
              {showAdvanced ? 'Hide settings' : 'Settings'}
              {effectiveBatchId && !showAdvanced ? (
                <span className="ml-2 font-mono font-normal text-[#94A3B8]">{effectiveBatchId}</span>
              ) : null}
            </button>
            {showAdvanced ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Source">
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
                </Field>
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
                <Field label="PSP">
                  <input
                    className={inputClass}
                    value={psp}
                    onChange={(e) => setPsp(e.target.value)}
                    placeholder="razorpay"
                  />
                </Field>
                <Field label="Batch reference">
                  <input
                    className={inputClass}
                    value={effectiveBatchId}
                    onChange={(e) => setLocalBatchId(e.target.value)}
                    placeholder="Created on upload"
                  />
                </Field>
              </div>
            ) : null}
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
