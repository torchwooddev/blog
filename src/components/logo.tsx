/** 站点标志：单色墨印，随前景色自适应（暗色自动反白）。 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <g stroke="var(--background)" strokeWidth="5" strokeLinecap="round">
        <line x1="19" y1="24" x2="45" y2="24" />
        <line x1="19" y1="34" x2="45" y2="34" />
        <line x1="19" y1="44" x2="35" y2="44" />
      </g>
    </svg>
  )
}
