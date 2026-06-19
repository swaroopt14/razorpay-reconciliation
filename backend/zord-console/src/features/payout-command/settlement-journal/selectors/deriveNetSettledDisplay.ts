import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'

export type NetSettledDisplay = {
  value: string
  sub: string
  isHonestZero: boolean
}

/** Split gross observed vs net settled — avoid misleading ₹0 when gross > 0. */
export function deriveNetSettledDisplay(
  totalAmount: number,
  totalSettled: number,
  settledRowCount: number,
  totalRows: number,
): NetSettledDisplay {
  if (totalRows === 0) {
    return { value: '—', sub: settlementJournalCopy.sidebar.selectBatch, isHonestZero: false }
  }
  if (totalSettled > 0) {
    return {
      value: formatJournalMoney(totalSettled),
      sub: 'Sum of net settled amounts from source file',
      isHonestZero: false,
    }
  }
  if (totalAmount > 0) {
    return {
      value: settlementJournalCopy.netSettledNotProvided,
      sub: `Observed ${formatJournalMoney(totalAmount)} — net settled field empty in source`,
      isHonestZero: true,
    }
  }
  return {
    value: formatJournalMoney(0),
    sub: `${settledRowCount.toLocaleString('en-IN')} of ${totalRows.toLocaleString('en-IN')} rows marked settled`,
    isHonestZero: false,
  }
}
