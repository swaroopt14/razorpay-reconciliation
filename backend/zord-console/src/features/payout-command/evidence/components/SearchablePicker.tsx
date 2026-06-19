'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Glyph } from '../../shared'

export type PickerOption = {
  value: string
  label: string
  /** Smaller secondary line (badge label, status, etc.). */
  secondary?: string
  /** Optional disambiguator shown after the label, e.g. truncated id. */
  hint?: string
  /** Tone for the right-side badge. */
  badgeTone?: 'neutral' | 'accent' | 'success' | 'warn'
}

type SearchablePickerProps = {
  id: string
  /** Top-of-control eyebrow label. */
  label: string
  /** Currently selected value. */
  value: string
  onChange: (value: string) => void
  options: PickerOption[]
  placeholder?: string
  /** Placeholder when no options are loaded yet. */
  emptyState?: string
  /** Placeholder for the search input inside the popover. */
  searchPlaceholder?: string
  /** localStorage key for tracking last-5 chosen values. */
  recentStorageKey?: string
  disabled?: boolean
  /** Maximum options to render at once to keep DOM light. */
  maxVisible?: number
  /** Show this fallback label when current value isn't in options (e.g. a pinned batch). */
  fallbackLabelForUnknownValue?: (value: string) => string
}

const DEFAULT_MAX_VISIBLE = 200
const RECENT_LIMIT = 5

function loadRecents(key: string | undefined): string[] {
  if (!key || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function saveRecent(key: string | undefined, value: string) {
  if (!key || typeof window === 'undefined' || !value) return
  try {
    const prev = loadRecents(key).filter((v) => v !== value)
    const next = [value, ...prev].slice(0, RECENT_LIMIT)
    window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* ignore quota / privacy errors */
  }
}

function badgeClasses(tone: PickerOption['badgeTone']): string {
  if (tone === 'accent') return 'border-violet-200 bg-violet-50 text-violet-800'
  if (tone === 'success') return 'border-black/30 bg-neutral-100 text-black'
  if (tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  if (h.includes(n)) return true
  let hi = 0
  for (let ni = 0; ni < n.length; ni += 1) {
    const ch = n[ni]
    const found = h.indexOf(ch, hi)
    if (found === -1) return false
    hi = found + 1
  }
  return true
}

export function SearchablePicker({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyState = 'No options',
  searchPlaceholder = 'Type to search…',
  recentStorageKey,
  disabled,
  maxVisible = DEFAULT_MAX_VISIBLE,
  fallbackLabelForUnknownValue,
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [recents, setRecents] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setRecents(loadRecents(recentStorageKey))
  }, [recentStorageKey])

  const optionByValue = useMemo(() => {
    const map = new Map<string, PickerOption>()
    for (const opt of options) map.set(opt.value, opt)
    return map
  }, [options])

  const currentLabel = useMemo(() => {
    if (!value) return placeholder
    const opt = optionByValue.get(value)
    if (opt) return opt.label
    if (fallbackLabelForUnknownValue) return fallbackLabelForUnknownValue(value)
    return value
  }, [value, optionByValue, placeholder, fallbackLabelForUnknownValue])

  const currentSecondary = useMemo(() => {
    if (!value) return undefined
    return optionByValue.get(value)?.secondary
  }, [value, optionByValue])

  const recentOptions = useMemo(() => {
    if (!recents.length) return [] as PickerOption[]
    return recents
      .map((v) => optionByValue.get(v))
      .filter((opt): opt is PickerOption => Boolean(opt))
      .filter((opt) => opt.value !== value)
  }, [recents, optionByValue, value])

  const filteredOptions = useMemo(() => {
    const q = query.trim()
    if (!q) return options
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.hint ?? ''} ${opt.secondary ?? ''} ${opt.value}`
      return fuzzyMatch(haystack, q)
    })
  }, [options, query])

  const visibleOptions = filteredOptions.slice(0, maxVisible)
  const overflow = Math.max(0, filteredOptions.length - visibleOptions.length)

  /** Flat list used for keyboard navigation: recents first, then filtered. */
  const navOptions = useMemo(() => {
    if (query.trim()) return visibleOptions
    return [...recentOptions, ...visibleOptions]
  }, [query, recentOptions, visibleOptions])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (containerRef.current.contains(e.target as Node)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const commit = useCallback(
    (next: string) => {
      onChange(next)
      saveRecent(recentStorageKey, next)
      setRecents(loadRecents(recentStorageKey))
      setOpen(false)
      setQuery('')
    },
    [onChange, recentStorageKey],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((idx) => Math.min(idx + 1, Math.max(0, navOptions.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((idx) => Math.max(0, idx - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = navOptions[highlightIndex]
      if (target) commit(target.value)
    }
  }

  const hasOptions = options.length > 0
  const showRecents = !query.trim() && recentOptions.length > 0

  return (
    <div className="relative w-full" ref={containerRef}>
      <label
        htmlFor={`${id}-trigger`}
        className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
      >
        {label}
      </label>
      <button
        id={`${id}-trigger`}
        type="button"
        disabled={disabled || !hasOptions}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex h-10 w-full items-center justify-between gap-2 rounded-[0.75rem] border border-slate-200 bg-white px-3 text-left text-[13.5px] font-semibold text-slate-900 outline-none transition hover:border-slate-300 focus:border-black/60 focus:ring-2 focus:ring-black/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-[13.5px]">{currentLabel}</span>
          {currentSecondary ? (
            <span className="truncate text-[10.5px] font-medium text-slate-500">{currentSecondary}</span>
          ) : null}
        </span>
        <Glyph
          name="arrow-up-right"
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${open ? 'rotate-90' : 'rotate-45'}`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-labelledby={`${id}-trigger`}
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-[0.85rem] border border-slate-200 bg-white shadow-[0_18px_40px_-18px_rgba(15,23,42,0.25)]"
        >
          <div className="relative border-b border-slate-100 px-2.5 py-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-[0.6rem] border border-slate-200 bg-white pl-8 pr-2 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-black/60 focus:ring-2 focus:ring-black/15"
            />
            <Glyph name="search" className="pointer-events-none absolute left-5 top-[14px] h-4 w-4 text-slate-400" />
          </div>

          <div ref={listRef} className="max-h-[18rem] overflow-y-auto py-1">
            {!hasOptions ? (
              <p className="px-3 py-6 text-center text-[13px] text-slate-500">{emptyState}</p>
            ) : navOptions.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-slate-500">
                No matches for &ldquo;{query}&rdquo;
              </p>
            ) : (
              <>
                {showRecents ? (
                  <>
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Recent
                    </p>
                    {recentOptions.map((opt, idx) => (
                      <PickerRow
                        key={`recent-${opt.value}`}
                        option={opt}
                        active={highlightIndex === idx}
                        selected={opt.value === value}
                        onHover={() => setHighlightIndex(idx)}
                        onSelect={() => commit(opt.value)}
                      />
                    ))}
                    <div className="my-1 border-t border-slate-100" />
                    <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      All
                    </p>
                  </>
                ) : null}
                {visibleOptions.map((opt, i) => {
                  const navIdx = showRecents ? recentOptions.length + i : i
                  return (
                    <PickerRow
                      key={opt.value}
                      option={opt}
                      active={highlightIndex === navIdx}
                      selected={opt.value === value}
                      onHover={() => setHighlightIndex(navIdx)}
                      onSelect={() => commit(opt.value)}
                    />
                  )
                })}
                {overflow > 0 ? (
                  <p className="border-t border-slate-100 px-3 py-2 text-[11.5px] text-slate-500">
                    Showing first {visibleOptions.length} of {filteredOptions.length}. Refine search to narrow.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[10.5px] text-slate-500">
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>{' '}
              navigate
              <span className="mx-1.5">·</span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{' '}
              select
              <span className="mx-1.5">·</span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px]">Esc</kbd>{' '}
              close
            </span>
            <span className="tabular-nums">
              {filteredOptions.length} {filteredOptions.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PickerRow({
  option,
  active,
  selected,
  onSelect,
  onHover,
}: {
  option: PickerOption
  active: boolean
  selected: boolean
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
        active ? 'bg-slate-50' : 'bg-white'
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate font-mono text-[13px] font-semibold text-slate-900">{option.label}</span>
          {option.hint ? <span className="truncate text-[11px] text-slate-500">{option.hint}</span> : null}
        </span>
        {option.secondary ? (
          <span className="truncate text-[11px] text-slate-500">{option.secondary}</span>
        ) : null}
      </span>
      {option.secondary && option.badgeTone ? (
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses(option.badgeTone)}`}
        >
          {option.secondary}
        </span>
      ) : null}
      {selected ? (
        <span className="ml-auto text-[11px] font-semibold text-black">Selected</span>
      ) : null}
    </button>
  )
}
