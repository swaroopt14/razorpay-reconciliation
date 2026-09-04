import type { JournalFailureRow, JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export function intentsToCsv(rows: JournalIntentRow[]) {
  const header = [
    'Intent ID',
    'Tenant ID',
    'Amount',
    'Currency',
    'Execution at',
    'Provider',
    'Quality score',
    'Status summary',
    'Batch ID',
  ]
  const lines = rows.map((row) =>
    [
      row.requestId,
      row.tenantId,
      row.amount,
      row.currency ?? '',
      row.intendedExecutionAt,
      row.provider,
      row.confidenceLabel,
      row.infoSummary,
      row.batchId,
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export function failuresToCsv(rows: JournalFailureRow[]) {
  const header = [
    'Request ID',
    'Batch ID',
    'Stage',
    'Reason',
    'Amount',
    'Payment partner',
    'Last updated',
  ]
  const lines = rows.map((row) =>
    [
      row.requestId,
      row.batchId,
      row.failureStage,
      row.failureReason,
      row.amount,
      row.paymentPartner,
      row.lastUpdated,
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export function downloadFailuresCsv(rows: JournalFailureRow[], batchId: string) {
  downloadCsv(`intent-journal-failures${batchId ? `-${batchId}` : ''}.csv`, failuresToCsv(rows))
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
