'use client'

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
  const uploadLabel = kind === 'intent' ? 'Payment instruction' : 'Settlement confirmation'

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
        aria-describedby="batch-upload-error-detail"
        className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="batch-upload-error-title" className="text-[18px] font-bold text-[#991b1b]">
          {uploadLabel} upload failed
        </h2>
        <p className="mt-2 text-[13px] text-[#64748b]">
          The file was not uploaded. Review the reason below, correct it, and try again.
        </p>
        {fileName ? (
          <p className="mt-3 truncate font-mono text-[12px] text-[#475569]" title={fileName}>
            {fileName}
          </p>
        ) : null}
        <div
          id="batch-upload-error-detail"
          className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-[13px] leading-relaxed text-[#7f1d1d]"
        >
          {message}
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-5 h-9 rounded-lg bg-[#991b1b] px-4 text-[13px] font-semibold text-white hover:bg-[#7f1d1d]"
        >
          Close
        </button>
      </div>
    </div>
  )
}
