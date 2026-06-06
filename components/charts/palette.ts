// ─────────────────────────────────────────────────────────────────────────────
// components/charts/palette.ts
//
// Single source of chart colors, wired to the Flowra design tokens
// (tailwind.config.js). Keeping them here means every chart looks the same and a
// rebrand is one edit.
// ─────────────────────────────────────────────────────────────────────────────

export const CHART = {
  primary: '#7c3aed', // primary-600 / brand
  pos:     '#059669',
  neg:     '#dc2626',
  warn:    '#d97706',
  info:    '#2563eb',
  ink2:    '#334155',
  ink3:    '#64748b',
  ink4:    '#94a3b8',
  grid:    '#eef2f7',
  axis:    '#94a3b8',
} as const

// Ordered categorical palette for multi-series / donut slices.
export const CHART_SERIES = [
  '#7c3aed', // violet
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
  '#dc2626', // red
] as const

export const AXIS_TICK = { fill: CHART.ink4, fontSize: 11 } as const

// Shared animation timing — calm, professional easing across all charts.
export const ANIM = { duration: 650, easing: 'ease-out' as const }
