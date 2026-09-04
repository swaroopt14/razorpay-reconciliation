'use client'

import { useState } from 'react'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type EvidencePackExportTabProps = {
  pack: EvidencePackFull | null
}

export function EvidencePackExportTab({ pack }: EvidencePackExportTabProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const paymentReference =
    pack?.evidence_pack_id ||
    pack?.client_payout_ref ||
    pack?.client_reference ||
    pack?.intent_id ||
    ''

  const runExport = async (
    exportType: 'FINANCE_SUMMARY' | 'AUDIT_DETAILED' | 'BANK_PSP_PACK' | 'RAW_JSON',
    label: string,
  ) => {
    const reference = paymentReference.trim()
    if (!reference) {
      setMessage('Payment reference not available for this pack.')
      return
    }
    setExporting(exportType)
    try {
      const res = await fetch('/api/v1/dispute/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payment_reference: reference,
          dispute_reason: 'BENEFICIARY_SAYS_NOT_RECEIVED',
          export_type: exportType,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        setMessage(`${label}: ${text.slice(0, 220) || evidenceCopy.export.apiPending}`)
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i)
      const filename = match?.[1] || `${pack?.evidence_pack_id || 'evidence-export'}.bin`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMessage(`Downloaded ${filename}.`)
    } catch {
      setMessage(`${label}: ${evidenceCopy.export.apiPending}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!pack || Boolean(exporting)}
          onClick={() => void runExport('FINANCE_SUMMARY', evidenceCopy.export.financePdf)}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.financePdf}
        </button>
        <button
          type="button"
          disabled={!pack || Boolean(exporting)}
          onClick={() => void runExport('AUDIT_DETAILED', evidenceCopy.export.auditPdf)}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.auditPdf}
        </button>
        <button
          type="button"
          disabled={!pack || Boolean(exporting)}
          onClick={() => void runExport('BANK_PSP_PACK', evidenceCopy.export.bankPack)}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.bankPack}
        </button>
        <button
          type="button"
          disabled={!pack}
          onClick={() => void runExport('RAW_JSON', evidenceCopy.export.rawJson)}
          className="rounded-[0.85rem] bg-[#111111] px-3 py-2 text-[14px] font-semibold text-white hover:bg-[#222] disabled:opacity-50"
        >
          {evidenceCopy.export.rawJson}
        </button>
      </div>
      {message ? <p className="text-[13px] text-[#475569]">{message}</p> : null}
    </div>
  )
}
