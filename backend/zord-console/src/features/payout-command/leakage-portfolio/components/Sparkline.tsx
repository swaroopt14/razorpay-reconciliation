export function Sparkline({
  path,
  className = '',
  stroke = 'currentColor',
}: {
  path: string
  className?: string
  stroke?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 18"
      fill="none"
      aria-hidden="true"
    >
      <path d={path} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
