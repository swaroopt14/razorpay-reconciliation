'use client'

import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'

type BatchUploadErrorDialogProps = {
  kind: 'intent' | 'settlement'
  message: string
  fileName?: string | null
  onClose: () => void
}

export function BatchUploadErrorDialog({
  kind,
  message,
  fileName,
  onClose,
}: BatchUploadErrorDialogProps) {
  const c = BATCH_REVIEW_COPY.dialogs
  const context = kind === 'intent' ? c.uploadErrorIntentTitle : c.uploadErrorSettlementTitle
  const errorText = message.trim() || c.uploadErrorFallback

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-upload-error-title"
        aria-describedby="batch-upload-error-context"
        className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="batch-upload-error-context" className="text-[13px] font-medium text-[#64748b]">
          {context}
        </p>
        {fileName ? (
          <p className="mt-1 break-all font-mono text-[12px] text-[#475569]" title={fileName}>
            {fileName}
          </p>
        ) : null}
        <h2
          id="batch-upload-error-title"
          className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[16px] font-semibold leading-relaxed text-[#991b1b]"
        >
          {errorText}
        </h2>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-5 h-9 rounded-lg bg-[#991b1b] px-4 text-[13px] font-semibold text-white hover:bg-[#7f1d1d]"
        >
          {c.close}
        </button>
      </div>
    </div>
  )
}
