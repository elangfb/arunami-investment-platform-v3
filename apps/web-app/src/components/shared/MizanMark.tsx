import type { SVGProps } from 'react'

// Mizan brand mark — the rub el hizb (ربع الحزب): two overlapping squares forming
// an eight-point Islamic star/seal. "Mizan" (ميزان) is the Balance of fair measure;
// the geometry carries the syariah identity, the MIZAN wordmark carries the meaning.
// Drawn on a 24-grid with currentColor so it inverts cleanly (white on the navy tile,
// navy on light surfaces). Size via className (e.g. `size-7`).
export function MizanMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect x="6" y="6" width="12" height="12" />
      <rect x="6" y="6" width="12" height="12" transform="rotate(45 12 12)" />
    </svg>
  )
}
