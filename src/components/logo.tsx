/** 站点标志（与 favicon.svg 同形的内联版本，可随主题微调）。 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <g stroke="#ffffff" strokeWidth="5" strokeLinecap="round">
        <line x1="19" y1="24" x2="45" y2="24" />
        <line x1="19" y1="34" x2="45" y2="34" />
        <line x1="19" y1="44" x2="35" y2="44" />
      </g>
    </svg>
  )
}
