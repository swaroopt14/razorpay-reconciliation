'use client'

import Link from 'next/link'
import { type ReactNode, type Ref, useCallback, useEffect, useMemo, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { COMMAND_CENTER_LABEL_GREEN, HOME_BODY_IMPERIAL_SM } from '../../command-center/homeCommandCenterTokens'
import { parseUploadedSheet, type BatchRow, type ZordPipelineIntake } from '@/services/payout-command/batch-model'
import { postIntentBulkIngest } from '@/services/payout-command/batch-intake/postIntentBulkIngest'
import { parseBulkIngestAcceptedResponse } from '@/services/payout-command/batch-intake/intakeHttpShared'
import {
  postSettlementFileUpload,
  SETTLEMENT_FILE_ACCEPT,
} from '@/services/payout-command/batch-intake/postSettlementFileUpload'
import { BatchPortalUploadZone } from './portal/BatchPortalUploadZone'
import { PORTAL_BLUE_TITLE, PORTAL_PRIMARY_BTN } from './portal/batchPortalTokens'
import { BATCH_REVIEW_COPY, type SourceTypeOption } from '../copy/batchCommandCenterCopy'

const INTENT_FILE_ACCEPT =
  '.csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function bulkIngestSourceTypeFromFilename(_filename: string): string {
  return 'CSV'
}

function sourceTypeToSystemLabel(option: SourceTypeOption): string {
  return option
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={COMMAND_CENTER_LABEL_GREEN}>{children}</div>
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  )
}

export type BatchIntakeSnapshot = ZordPipelineIntake & {
  settlementBatchId: string | null
}

export type IntentIngestSuccessPayload = {
  batchId: string
  effectiveBatch: string | null
  parsedRows: BatchRow[]
  fileName: string
}

export type SettlementIngestSuccessPayload = {
  batchId: string
  fileName: string
  parsedRows: BatchRow[]
}

export type BatchUploadStatus = {
  state: 'idle' | 'syncing' | 'synced' | 'failed'
  message: string | null
}

type BatchIntakePanelProps = {
  batchIdInput: string
  batchReferenceRef?: Ref<HTMLInputElement>
  onBatchIdChange: (value: string) => void
  isSandboxRoute: boolean
  onIntentIngestSuccess: (payload: IntentIngestSuccessPayload) => void
  onSettlementIngestSuccess: (payload: SettlementIngestSuccessPayload) => void
  onSnapshotChange: (snapshot: BatchIntakeSnapshot) => void
  onUploadStatusChange?: (status: BatchUploadStatus) => void
  onIntentUploadFailed?: (batchId: string) => void
}

export function BatchIntakePanel({
  batchIdInput,
  batchReferenceRef,
  onBatchIdChange,
  isSandboxRoute,
  onIntentIngestSuccess,
  onSettlementIngestSuccess,
  onSnapshotChange,
  onUploadStatusChange,
  onIntentUploadFailed,
}: BatchIntakePanelProps) {
  const { tenantId, tenantReady, refreshTenant } = useSessionTenant()
  const [sourceType, setSourceType] = useState<SourceTypeOption>(BATCH_REVIEW_COPY.fields.sourceTypeOptions[0])
  const [sourceSystem, setSourceSystem] = useState('')
  const [psp, setPsp] = useState(() => process.env.NEXT_PUBLIC_ZORD_SETTLEMENT_PSP ?? 'razorpay')
  const [bulkForceReprocess, setBulkForceReprocess] = useState(false)
  const [selectedIntentFile, setSelectedIntentFile] = useState<File | null>(null)
  const [selectedSettlementFile, setSelectedSettlementFile] = useState<File | null>(null)
  const [intentFileName, setIntentFileName] = useState<string | null>(null)
  const [settlementFileName, setSettlementFileName] = useState<string | null>(null)
  const [settlementIngestOk, setSettlementIngestOk] = useState(false)
  const [intakeStep, setIntakeStep] = useState<'idle' | 'intent_uploading' | 'intent_ready' | 'settlement_uploading' | 'closed'>('idle')
  const [intentIngestOk, setIntentIngestOk] = useState(false)
  const [settlementBatchId, setSettlementBatchId] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'ready'>('idle')

  const reportUploadStatus = useCallback(
    (state: BatchUploadStatus['state'], message: string | null) => {
      onUploadStatusChange?.({ state, message })
    },
    [onUploadStatusChange],
  )

  useEffect(() => {
    setSourceSystem(sourceTypeToSystemLabel(sourceType))
  }, [sourceType])

  const settlementBatchIdResolved = useMemo(
    () => (settlementBatchId ?? batchIdInput.trim()).trim(),
    [batchIdInput, settlementBatchId],
  )

  const hasManualOrServerBatchId = useMemo(() => batchIdInput.trim().length > 0, [batchIdInput])

  const settlementCredentialsReady = useMemo(
    () =>
      tenantReady &&
      tenantId.trim().length > 0 &&
      psp.trim().length > 0 &&
      settlementBatchIdResolved.length > 0 &&
      (intentIngestOk || hasManualOrServerBatchId),
    [hasManualOrServerBatchId, intentIngestOk, psp, settlementBatchIdResolved, tenantId, tenantReady],
  )

  const settlementBlockedReason = useMemo(() => {
    if (settlementCredentialsReady) return null
    if (!tenantReady) return 'Resolving session…'
    if (!tenantId.trim()) return 'Sign in or open Advanced details to set your workspace scope.'
    if (!psp.trim()) return 'Enter payment source / partner (e.g. razorpay or cashfree).'
    if (!settlementBatchIdResolved) return 'Complete Step 1 or enter a batch reference above.'
    if (!intentIngestOk && !hasManualOrServerBatchId) {
      return 'Finish Step 1 successfully, or enter a batch reference before uploading confirmation.'
    }
    return null
  }, [
    hasManualOrServerBatchId,
    intentIngestOk,
    psp,
    settlementBatchIdResolved,
    settlementCredentialsReady,
    tenantId,
    tenantReady,
  ])

  const settlementBusy = intakeStep === 'settlement_uploading'
  const settlementFilePickerEnabled = settlementCredentialsReady && !settlementBusy
  const settlementUploadEnabled =
    settlementFilePickerEnabled && Boolean(selectedSettlementFile) && !settlementBusy

  useEffect(() => {
    onSnapshotChange({
      intakeStep,
      intentFileName,
      intentIngestOk,
      settlementFileName,
      settlementIngestOk,
      uploadedFileName,
      uploadState,
      settlementBatchId,
    })
  }, [
    intakeStep,
    intentFileName,
    intentIngestOk,
    settlementFileName,
    settlementIngestOk,
    uploadedFileName,
    uploadState,
    settlementBatchId,
    onSnapshotChange,
  ])

  const onIntentFileChosen = useCallback((file: File | null) => {
    if (!file) return
    setSelectedIntentFile(file)
    setIntentIngestOk(false)
    setSettlementBatchId(null)
    setSelectedSettlementFile(null)
    setSettlementFileName(null)
    setSettlementIngestOk(false)
    setIntakeStep('idle')
    reportUploadStatus('idle', null)
  }, [reportUploadStatus])

  const onIntentBatchUpload = useCallback(async () => {
    const file = selectedIntentFile
    if (!file) return
    const userBatchId = batchIdInput.trim()
    setIntentFileName(file.name)
    setIntentIngestOk(false)
    setSettlementFileName(null)
    setIntakeStep('intent_uploading')
    reportUploadStatus('syncing', BATCH_REVIEW_COPY.intake.uploadIntentBusy)
    setUploadState('uploading')
    if (userBatchId) setSettlementBatchId(userBatchId)
    try {
      const parsed = await parseUploadedSheet(file)
      if (bulkForceReprocess && !userBatchId) {
        throw new Error('Reprocess requires a batch reference in the field above.')
      }
      const result = await postIntentBulkIngest({
        file,
        sourceType: bulkIngestSourceTypeFromFilename(file.name),
        sourceSystem: sourceSystem.trim() || undefined,
        optionalBatchId: userBatchId || undefined,
        forceReprocess: bulkForceReprocess,
      })
      if (!result.ok) {
        const batchToKeep = userBatchId || result.batchIdFromBody
        if (batchToKeep) {
          setSettlementBatchId(batchToKeep)
          if (batchToKeep !== batchIdInput.trim()) onBatchIdChange(batchToKeep)
          onIntentUploadFailed?.(batchToKeep)
        }
        const detail = result.errorMessage?.trim() || `HTTP ${result.httpStatus}`
        const extra = result.responseText.trim().slice(0, 280)
        throw new Error(extra && !detail.includes(extra) ? `${detail} — ${extra}` : detail)
      }
      const ingestAckParsed = parseBulkIngestAcceptedResponse(result.responseText)
      if (ingestAckParsed && ingestAckParsed.accepted === 0) {
        const firstFailure = ingestAckParsed.rows.find((row) => row.error?.trim())
        throw new Error(firstFailure?.error?.trim() || 'The file was received, but none of its rows entered the processing pipeline.')
      }
      const effectiveBatch = result.batchIdFromBody || userBatchId
      if (!effectiveBatch) {
        throw new Error('Upload succeeded but the server did not return a batch reference.')
      }
      setSettlementBatchId(effectiveBatch)
      if (effectiveBatch !== batchIdInput.trim()) onBatchIdChange(effectiveBatch)
      setIntentIngestOk(true)
      void refreshTenant()
      markSandboxSetupStep('intent-ingest')
      reportUploadStatus('synced', `Payment file accepted. Batch reference: ${effectiveBatch}.`)
      setUploadState('ready')
      setUploadedFileName(file.name)
      setIntakeStep('intent_ready')
      onIntentIngestSuccess({
        batchId: effectiveBatch,
        effectiveBatch,
        parsedRows: parsed,
        fileName: file.name,
      })
    } catch (error) {
      setIntentIngestOk(false)
      reportUploadStatus(
        'failed',
        `Payment file upload failed (${error instanceof Error ? error.message : 'unknown error'}). Step 2 stays locked until upload succeeds.`,
      )
      setIntakeStep('idle')
      setUploadState('idle')
    }
  }, [
    batchIdInput,
    bulkForceReprocess,
    onBatchIdChange,
    onIntentIngestSuccess,
    onIntentUploadFailed,
    refreshTenant,
    reportUploadStatus,
    selectedIntentFile,
    sourceSystem,
  ])

  const onSettlementFileChosen = useCallback(
    (file: File | null) => {
      if (!file) return
      setSelectedSettlementFile(file)
      setSettlementIngestOk(false)
      reportUploadStatus('idle', null)
      if (intakeStep === 'closed') setIntakeStep('intent_ready')
    },
    [intakeStep, reportUploadStatus],
  )

  const onSettlementBatchUpload = useCallback(async () => {
    const file = selectedSettlementFile
    if (!file) return
    const pspVal = psp.trim().toLowerCase()
    const bid = (settlementBatchId ?? batchIdInput.trim()).trim()
    if (!tenantReady || !pspVal || !bid) {
      reportUploadStatus(
        'failed',
        settlementBlockedReason ??
          'Confirmation upload needs an active session, payment partner, and batch reference.',
      )
      return
    }
    setSettlementFileName(file.name)
    setIntakeStep('settlement_uploading')
    reportUploadStatus('syncing', BATCH_REVIEW_COPY.intake.uploadSettlementBusy)
    try {
      const parsed = await parseUploadedSheet(file)
      const result = await postSettlementFileUpload({
        file,
        psp: pspVal,
        batchId: bid,
      })
      if (!result.ok) {
        const detail = result.errorMessage?.trim() || `HTTP ${result.httpStatus || 'error'}`
        const extra = result.responseText.trim().slice(0, 400)
        const parts = [detail]
        if (extra && !detail.includes(extra)) parts.push(extra)
        if (result.httpStatus) parts.unshift(`[${result.httpStatus}]`)
        throw new Error(parts.join(' — '))
      }
      setSettlementIngestOk(true)
      reportUploadStatus('synced', BATCH_REVIEW_COPY.dialogs.settlementBody(bid))
      markSandboxSetupStep('settlement')
      setIntakeStep('closed')
      onSettlementIngestSuccess({ batchId: bid, fileName: file.name, parsedRows: parsed })
    } catch (error) {
      reportUploadStatus(
        'failed',
        (() => {
          const detail = error instanceof Error ? error.message.trim() : ''
          return detail ? `Confirmation upload failed: ${detail}` : 'Confirmation upload failed. Check your session and retry.'
        })(),
      )
      setIntakeStep('intent_ready')
    }
  }, [
    batchIdInput,
    onSettlementIngestSuccess,
    psp,
    reportUploadStatus,
    selectedSettlementFile,
    settlementBatchId,
    settlementBlockedReason,
    tenantReady,
  ])

  const c = BATCH_REVIEW_COPY

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>{c.intake.title}</SectionLabel>
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#888888]">{c.intake.stepBadge}</span>
        </div>
        <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{c.intake.helper}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              {c.fields.sourceType}
            </span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceTypeOption)}
              className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
            >
              {c.fields.sourceTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              {c.fields.paymentSource}
            </span>
            <input
              value={psp}
              onChange={(e) => setPsp(e.target.value)}
              placeholder={c.fields.paymentSourcePlaceholder}
              className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              {c.fields.batchReference}
            </span>
            <input
              ref={batchReferenceRef}
              value={batchIdInput}
              onChange={(e) => onBatchIdChange(e.target.value)}
              placeholder={c.fields.batchReferencePlaceholder}
              className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
            />
          </label>
          <label className="flex flex-col justify-end gap-1 sm:col-span-2 lg:col-span-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              {c.fields.reprocess}
            </span>
            <span className="flex min-h-9 flex-col justify-center gap-0.5 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[13px] text-[#0A0A0A]">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={bulkForceReprocess}
                  onChange={(e) => setBulkForceReprocess(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1]"
                />
                {c.fields.reprocess}
              </span>
              <span className="text-[11px] text-[#64748b]">{c.fields.reprocessHelper}</span>
            </span>
          </label>
        </div>
        {settlementBatchIdResolved ? (
          <p className="mt-3 text-[12px] text-[#1A1A1A]">
            <span className="font-semibold text-[#334155]">{c.fields.activeBatchId}: </span>
            <span className="font-mono text-[#0A0A0A]">{settlementBatchIdResolved}</span>
          </p>
        ) : null}
        {settlementBlockedReason && !settlementCredentialsReady ? (
          <p className="mt-2 text-[12px] font-medium text-amber-800">{settlementBlockedReason}</p>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div
            id="batch-intake-step-1"
            className={`scroll-mt-24 rounded-2xl border p-4 ${
              intentIngestOk ? 'border-black/30 bg-neutral-100/80' : 'border-[#e2e8f0] bg-white'
            }`}
          >
            <p className={PORTAL_BLUE_TITLE}>{c.intake.uploadFilesLabel}</p>
            <p className="mt-0.5 text-[12px] font-medium text-[#64748b]">{c.intake.step1Short}</p>
            <p className="mt-1 text-[12px] text-[#64748b]">{c.intake.step1Helper}</p>
            <div className="mt-3">
              <BatchPortalUploadZone
                accept={INTENT_FILE_ACCEPT}
                busy={intakeStep === 'intent_uploading'}
                selectedFileName={selectedIntentFile?.name ?? intentFileName}
                hint="CSV, XLS, or XLSX — one row per payment"
                inputLabel={c.intake.step1Title}
                onFileChosen={onIntentFileChosen}
              />
            </div>
            {selectedIntentFile ? (
              <button
                type="button"
                disabled={intakeStep === 'intent_uploading'}
                onClick={() => void onIntentBatchUpload()}
                className={`mt-3 w-full justify-center ${PORTAL_PRIMARY_BTN}`}
              >
                {intakeStep === 'intent_uploading' ? c.intake.uploadIntentBusy : c.intake.uploadIntent}
              </button>
            ) : null}
          </div>

          <div
            id="batch-intake-step-2"
            className={`scroll-mt-24 rounded-2xl border p-4 ${
              settlementIngestOk
                ? 'border-black/30 bg-neutral-100/80'
                : settlementCredentialsReady
                  ? 'border-[#e2e8f0] bg-white'
                  : 'border-dashed border-[#e2e8f0] bg-[#fafafa]'
            }`}
          >
            <p className={PORTAL_BLUE_TITLE}>{c.intake.uploadFilesLabel}</p>
            <p className="mt-0.5 text-[12px] font-medium text-[#64748b]">{c.intake.step2Short}</p>
            <p className="mt-1 text-[12px] text-[#64748b]">{c.intake.step2Helper}</p>
            <div className="mt-3">
              <BatchPortalUploadZone
                accept={SETTLEMENT_FILE_ACCEPT}
                busy={intakeStep === 'settlement_uploading'}
                disabled={!settlementFilePickerEnabled}
                selectedFileName={selectedSettlementFile?.name ?? settlementFileName}
                hint="Bank / PSP confirmation matched to active batch reference"
                inputLabel={c.intake.step2Title}
                onFileChosen={onSettlementFileChosen}
              />
            </div>
            {selectedSettlementFile ? (
              <button
                type="button"
                disabled={!settlementUploadEnabled}
                onClick={() => void onSettlementBatchUpload()}
                className={`mt-3 w-full justify-center ${PORTAL_PRIMARY_BTN}`}
              >
                {intakeStep === 'settlement_uploading' ? c.intake.uploadSettlementBusy : c.intake.uploadSettlement}
              </button>
            ) : null}
            {settlementIngestOk && settlementBatchIdResolved ? (
              <Link
                href={
                  isSandboxRoute
                    ? `/sandbox?dock=settlement&client_batch_id=${encodeURIComponent(settlementBatchIdResolved)}`
                    : `/payout-command-view/today?dock=settlement&client_batch_id=${encodeURIComponent(settlementBatchIdResolved)}`
                }
                className="mt-3 inline-flex text-[12px] font-semibold text-[#2563eb] underline"
              >
                {c.dialogs.openSettlementJournal}
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  )
}
