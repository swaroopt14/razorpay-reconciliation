/**
 * Business-facing copy for Payment Batch Review.
 * Avoid visible UI strings: intent-engine, intelligence, close readiness, sign-off,
 * disbursement processing, Fetch tenant id (main surface), 0.0% with zero denominator.
 */

export const BATCH_REVIEW_COPY = {
  pageTitle: 'Payment Batch Review',
  pageSubtitle:
    'Upload payment files, verify bank confirmations, and review issues before closing a batch.',

  sandboxBanner: 'Sandbox mode — testing only. No real payments will be sent.',

  workspace: {
    title: 'Workspace',
    company: 'Company',
    environment: 'Environment',
    environmentSandbox: 'Sandbox',
    environmentLive: 'Live',
    currentBatch: 'Current batch',
    notSelected: 'Not selected',
    notLoaded: 'Not loaded',
    selectBatch: 'Select batch',
    refresh: 'Refresh',
  },

  advancedDetails: 'Advanced details',

  toolbar: {
    uploadPaymentFile: 'Upload Payment File',
    uploadSettlementFile: 'Upload Bank / Settlement File',
    createPaymentManually: 'Create Payment Manually',
    intentJournal: 'Payment journal',
    settlementJournal: 'Settlement journal',
    refresh: 'Refresh',
    share: 'Share',
    liveSource: 'Payment processing',
  },

  intake: {
    title: 'Batch Intake',
    stepBadge: 'Step 1 → Step 2',
    helper:
      'Start by uploading the payment instruction file. Add bank or settlement confirmation data when available to verify outcomes.',
    step1Title: 'Upload payment instruction file',
    step1Helper:
      'CSV/XLSX from Tally, SAP, ERP, LMS, or internal finance system. One row should represent one payment.',
    step2Title: 'Upload bank / settlement confirmation file',
    step2Helper:
      'Bank statement, settlement report, status file, or SFTP export used to confirm payment outcomes.',
    uploadFilesLabel: 'Upload files',
    step1Short: 'Step 1 · Payment instruction file',
    step2Short: 'Step 2 · Bank / settlement file',
    uploadIntent: 'Upload payment file',
    uploadIntentBusy: 'Uploading payment file…',
    uploadSettlement: 'Upload confirmation file',
    uploadSettlementBusy: 'Uploading confirmation file…',
    browseFiles: 'Browse files',
  },

  fields: {
    sourceType: 'Source type',
    sourceTypeOptions: [
      'Tally / ERP',
      'Bank file',
      'PSP / Payment gateway',
      'Manual CSV',
      'API upload',
      'SAP',
      'Other',
    ] as const,
    paymentSource: 'Payment source / partner',
    paymentSourcePlaceholder: 'Select bank, PSP, ERP, or source system',
    batchReference: 'Batch reference optional',
    batchReferencePlaceholder: 'Leave blank if you want Zord to create one automatically',
    reprocess: 'Reprocess this file',
    reprocessHelper: 'Use only when uploading a corrected file or rerunning a previous batch.',
    apiKey: 'API key (optional)',
    apiKeyPlaceholder: 'Same Bearer token as Postman',
    activeBatchId: 'Active batch reference',
  },

  dialogs: {
    intentTitle: 'Payment file uploaded',
    intentBody: (batchId: string) => `Batch ${batchId} has been uploaded and is being processed.`,
    settlementTitle: 'Confirmation file uploaded',
    settlementBody: (batchId: string) =>
      `Settlement confirmation for batch ${batchId} has been accepted.`,
    close: 'Close',
    openPaymentJournal: 'Open payment journal',
    openSettlementJournal: 'Open settlement journal',
  },

  fileProcessing: {
    title: 'File processing status',
    empty: 'Upload a payment file above to track processing status here.',
    fileReceived: 'File received',
    headerMapping: 'Header mapping complete',
    rowsProcessed: 'Rows processed',
    rowsFailed: 'Rows failed',
    intentsCreated: 'Payment intents created',
    needsReview: 'Needs review',
  },

  progress: {
    title: 'Upload progress & notifications',
    empty: 'Upload a payment file above to track progress here.',
  },

  pipeline: {
    title: 'Batch Progress',
    subtitle: 'Track this batch from file upload to payment proof.',
    steps: [
      { label: 'File received', description: 'Zord has received the payment file.' },
      { label: 'File mapped', description: 'Headers and fields are mapped into Zord’s payment structure.' },
      { label: 'Payment intents created', description: 'Each row is converted into a payment intent.' },
      {
        label: 'Confirmation received',
        description: 'Bank/settlement/status file has been uploaded or connected.',
      },
      { label: 'Matching completed', description: 'Zord has linked payment intents with outcome records.' },
      {
        label: 'Ready for proof / review',
        description: 'Batch is ready for evidence export or issue review.',
      },
    ] as const,
  },

  health: {
    clean: {
      title: 'Batch Health: Clean',
      body: 'No payments currently need review in this batch. Spot-check high-value payments and bank references before closing.',
    },
    waiting: {
      title: 'Batch Health: Waiting for Confirmation',
      body: 'Payment instructions are available, but bank/settlement confirmation data is missing. Upload the confirmation file to verify outcomes.',
    },
    review: {
      title: 'Batch Health: Review Required',
      body: 'Some payments need attention due to missing references, weak matches, duplicate risk, or settlement gaps.',
    },
  },

  kpis: {
    recordsProcessed: {
      title: 'Payment Records Processed',
      subtitle: 'Rows successfully read from the uploaded payment file.',
      empty: 'No payment file uploaded yet',
      emptyHelper: 'Upload a payment instruction file to begin.',
    },
    intendedValue: { title: 'Intended Payment Value' },
    bankConfirmed: {
      title: 'Bank-Confirmed Value',
      subtitle: 'Payments matched with bank, settlement, or status confirmation.',
      empty: 'Waiting for confirmation file',
      emptyHelper: 'Upload bank/settlement data to confirm outcomes.',
    },
    pending: {
      title: 'Pending Confirmation',
      subtitle: 'Payment instructions received, but confirmation signal is not available yet.',
      uploadCta: 'Upload Confirmation File',
    },
    needsReview: {
      title: 'Needs Review',
      subtitle: 'Payments with missing details, weak matches, duplicates, or settlement gaps.',
      viewCta: 'View Review Items',
    },
    valueNeedingReview: { title: 'Value Needing Review' },
    matchConfidence: { title: 'Average Match Confidence' },
    referenceCompleteness: { title: 'Reference Completeness' },
    missingReferenceRate: { title: 'Missing Reference Rate' },
    valueDateMismatch: { title: 'Value-Date Mismatches' },
    evidenceCoverage: { title: 'Evidence Coverage' },
    noData: 'No data yet',
    uploadToCalculate: 'Upload a payment file to calculate this.',
  },

  chart: {
    title: 'Payment Status Breakdown',
    empty: 'Select or upload a batch to see how many payments are confirmed, pending, failed, or need review.',
    confirmed: 'Confirmed',
    pending: 'Pending Confirmation',
    failed: 'Failed',
    needsReview: 'Needs Review',
    missingData: 'Missing Data',
    duplicateRisk: 'Duplicate Risk',
  },

  reviewTable: {
    title: 'Review Items',
    subtitle: 'Payments that need attention in this batch.',
    reviewInEngine: 'Review in Intent Engine',
    empty: 'No review items for this batch.',
    emptySelect: 'Upload a payment file or select a batch to see review items.',
    columns: {
      paymentRef: 'Payment Ref',
      invoiceNo: 'Invoice No.',
      beneficiary: 'Beneficiary',
      amount: 'Amount',
      issue: 'Issue',
      confidence: 'Confidence',
      action: 'Action',
    },
    actions: { review: 'Review' },
  },

  filePreview: {
    title: 'Uploaded file preview',
    subtitle: 'Rows parsed from the customer file before ingest (invoice blank when not in file).',
    empty: 'Upload an intent or settlement file to preview parsed rows here.',
  },

  manualPayment: {
    title: 'Create payment manually',
    back: '← Back to batch intake',
  },
} as const

export type SourceTypeOption = (typeof BATCH_REVIEW_COPY.fields.sourceTypeOptions)[number]
