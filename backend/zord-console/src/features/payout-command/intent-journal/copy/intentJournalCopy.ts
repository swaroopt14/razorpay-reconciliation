/** Customer-facing copy for Intent Journal (payment instructions). */

export const intentJournalCopy = {
  pageTitle: 'Intent Journal',
  hero: {
    label: 'Intended Payment Value',
    subtitle: 'Sum of payment instructions in this batch',
  },
  kpi: {
    paymentWorkflow: 'Payment Workflow',
    instructionsCreated: 'Payment Instructions Created',
    intendedValue: 'Intended Payment Value',
    readiness: 'Intent Quality',
    needsReview: 'Needs Review',
  },
  tabs: {
    instructions: 'Payment Instructions',
    reviewItems: 'Review Items',
  },
  table: {
    searchPlaceholder: 'Search invoice, payment ref, beneficiary, amount, status…',
    headers: {
      zordId: 'Zord ID',
      paymentRef: 'Payment Ref',
      amount: 'Amount',
      plannedDate: 'Planned Payment Date',
      paymentMode: 'Payment Mode',
      validation: 'Validation',
      status: 'Current Status',
      readiness: 'Quality',
      action: 'Action',
    },
    validationPending: 'Validation pending',
    emptyInstructions: 'No payment instructions in this batch yet.',
    emptyReview: 'No review items for this batch.',
  },
  status: {
    awaitingBankConfirmation: 'Awaiting Bank Confirmation',
    readyForDispatch: 'Ready for Dispatch',
    needsReview: 'Needs Review',
    failedValidation: 'Failed Validation',
    confirmedByBank: 'Confirmed by Bank',
  },
  sidebar: {
    batchLabel: 'Batch',
    instructions: 'payment instructions',
    intendedValue: 'intended value',
    selectBatch: 'Select a batch from the sidebar',
  },
  health: {
    fileMapping: 'File Mapping Status',
    requiredFields: 'Required Field Health',
    duplicateRisk: 'Duplicate Risk',
    beneficiaryValidation: 'Beneficiary Validation',
    tokenization: 'Tokenization Status',
    notConnected: 'Not connected yet',
    awaitingData: 'Awaiting data from ingest profile',
  },
  export: {
    menuLabel: 'Export',
    intentReport: 'Export payment intent report',
    reviewItems: 'Export review items',
    dispatchReady: 'Export dispatch-ready file',
    auditSummary: 'Export audit summary',
    dispatchNotAvailable: 'Dispatch export not available yet',
    auditNotAvailable: 'Audit bundle not available yet',
  },
} as const
