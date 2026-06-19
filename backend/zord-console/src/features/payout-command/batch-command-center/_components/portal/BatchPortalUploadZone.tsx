'use client'

import { type DragEvent, useCallback, useState } from 'react'
import { PORTAL_DROP_ZONE, PORTAL_PRIMARY_BTN } from './batchPortalTokens'

type BatchPortalUploadZoneProps = {
  accept: string
  disabled?: boolean
  busy?: boolean
  selectedFileName?: string | null
  hint: string
  onFileChosen: (file: File) => void
  inputLabel: string
  browseLabel?: string
}

function UploadIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden className="text-[#64748b]">
      <path
        d="M20 8v16M14 14l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 26h20a4 4 0 0 1 4 4v2H6v-2a4 4 0 0 1 4-4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BatchPortalUploadZone({
  accept,
  disabled,
  busy,
  selectedFileName,
  hint,
  onFileChosen,
  inputLabel,
  browseLabel = 'Browse files',
}: BatchPortalUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      const file = list?.[0]
      if (file) onFileChosen(file)
    },
    [onFileChosen],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled || busy) return
      handleFiles(e.dataTransfer.files)
    },
    [busy, disabled, handleFiles],
  )

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        if (!disabled && !busy) setDragOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragOver(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`${PORTAL_DROP_ZONE} ${dragOver ? 'border-[#2563eb] bg-[#eff6ff]' : ''} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <UploadIcon />
      <p className="mt-3 text-center text-[14px] font-medium text-[#334155]">Drag or drop your files here</p>
      <p className="mt-1 text-[12px] text-[#94a3b8]">or</p>
      {selectedFileName ? (
        <p className="mt-2 max-w-full truncate px-2 font-mono text-[11px] text-[#0f172a]" title={selectedFileName}>
          {selectedFileName}
        </p>
      ) : null}
      <label className={`mt-3 ${PORTAL_PRIMARY_BTN} ${busy ? 'pointer-events-none opacity-70' : 'cursor-pointer'}`}>
        {busy ? 'Uploading…' : browseLabel}
        <input
          type="file"
          accept={accept}
          disabled={disabled || busy}
          className="sr-only"
          aria-label={inputLabel}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-[#94a3b8]">{hint}</p>
    </div>
  )
}
