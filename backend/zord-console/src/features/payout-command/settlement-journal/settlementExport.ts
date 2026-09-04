import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export function observationsToCsv(rows: SettlementObservationTableRow[]) {
  const header = [
    'Settlement batch',
    'Client ref',
    'Bank ref',
    'Amount',
    'Settled',
    'Fee',
    'Status',
    'Source',
    'Observed',
    'Observation ID',
  ]
  const lines = rows.map((row) =>
    [
      row.settlementBatchId,
      row.clientRef,
      row.bankRef,
      row.amount,
      row.settledAmount,
      row.feeAmount,
      row.status,
      row.sourceSystem,
      row.observationTime,
      row.observationId,
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
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
