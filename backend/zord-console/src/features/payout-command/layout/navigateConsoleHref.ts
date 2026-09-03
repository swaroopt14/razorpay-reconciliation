/**
 * Soft client navigation often stalls when leaving the heavy `/sandbox` shell
 * (DockNav already hard-falls back after ~700ms for sidebar links).
 * In-page CTAs that must exit sandbox should hard-navigate immediately.
 */
export function hardNavigateConsoleHref(href: string): void {
  if (typeof window === 'undefined') return
  window.location.assign(href)
}
