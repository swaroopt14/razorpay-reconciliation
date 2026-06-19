/** Soft neutral corner glow — matches Home command center KPI cards. */
export function CommandCenterCardGlow() {
  return (
    <div
      className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.08) 0%, transparent 72%)' }}
      aria-hidden
    />
  )
}
