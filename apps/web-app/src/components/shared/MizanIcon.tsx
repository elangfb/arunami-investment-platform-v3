import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

// Mizan app-icon — the branded tile: navy-gradient rounded square + white rub el
// hizb octagram. Self-contained (its own background), so it matches the favicon
// (app/icon.svg) pixel-for-pixel. Proportions follow the Helium reference:
// full-bleed tile, corner radius ~26% (rx 8.4/32), octagram ~63% of the tile
// (side 14.3 → diagonal ≈ 0.63·32). Stroke ratio (2.4/32) matches MizanMark.
//
// Use MizanIcon where the brand needs its own tile (login header, sidebar). Use
// the bare [[MizanMark]] glyph on an existing surface (e.g. inline with a wordmark).
//
// Two surface presets. Each couples the tile gradient with its matching shadow, so
// callers pick a surface (not four raw values that could drift apart): the default
// navy reads on light canvas; `onDark` lightens the gradient + glow to pop on the
// deep-navy sidebar. Size via className (the shadow follows the rounded silhouette).
const SURFACE = {
  light: { from: '#14418f', to: '#2d7ff9', shadow: 'drop-shadow-[0_4px_14px_rgba(20,65,143,0.35)]' },
  dark: { from: '#3b82f6', to: '#60a5fa', shadow: 'drop-shadow-[0_2px_8px_rgba(59,130,246,0.45)]' },
} as const

export function MizanIcon({
  onDark = false,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { onDark?: boolean }) {
  const s = onDark ? SURFACE.dark : SURFACE.light
  const gid = onDark ? 'mizan-icon-dark' : 'mizan-icon-light'
  return (
    <svg viewBox="0 0 32 32" className={cn(s.shadow, className)} aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={s.from} />
          <stop offset="1" stopColor={s.to} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8.4" fill={`url(#${gid})`} />
      <g fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round">
        <rect x="8.85" y="8.85" width="14.3" height="14.3" />
        <rect x="8.85" y="8.85" width="14.3" height="14.3" transform="rotate(45 16 16)" />
      </g>
    </svg>
  )
}
