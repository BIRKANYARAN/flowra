'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/ds/index.ts — Flowra Design System (canonical barrel)
//
// SINGLE import path for all UI primitives going forward.
// New code: import from '@/components/ds'
// Existing code still works via @/components/ui + @/components/ui-kit
// ─────────────────────────────────────────────────────────────────────────────

// ── Utilities ─────────────────────────────────────────────────────────────────
export { cn } from '@/components/ui'

// ── Canonical Flowra components (primary API) ─────────────────────────────────
export { FlowraButton }                       from '@/components/ui-kit/FlowraButton'
export { FlowraCard }                         from '@/components/ui-kit/FlowraCard'
export { FlowraKpiCard }                      from '@/components/ui-kit/FlowraKpiCard'
export { FlowraStatusBadge }                  from '@/components/ui-kit/FlowraStatusBadge'
export { FlowraTable }                        from '@/components/ui-kit/FlowraTable'
export type { FlowraColumn }                  from '@/components/ui-kit/FlowraTable'
export { FlowraAlert }                        from '@/components/ui-kit/FlowraAlert'
export { FlowraInput }                        from '@/components/ui-kit/FlowraInput'
export { FlowraSelect }                       from '@/components/ui-kit/FlowraSelect'

// ── Primitives (backwards-compat aliases) ─────────────────────────────────────
export {
  Btn,
  Card,
  Label,
  SectionHeader,
  DSInput,
  DSSelect,
  StatusBadge,
  Money,
  formatMoney,
  StatCard,
  PageHeader,
  EmptyState,
  LoadingSpinner,
  ErrorBanner,
  sym,
  fmtMoney,
  fmtDate,
} from '@/components/ui'

// ── Layout atoms ──────────────────────────────────────────────────────────────
export { FlowraLogo } from '@/components/ui/FlowraLogo'
export { Icon }       from '@/components/ui/Icon'

// ── OS Shell — canonical layout primitives (use for all new screens) ──────────
export {
  TOKENS,
  PageShell,
  PageHero,
  SectionLabel,
  Panel,
  PanelHeader,
  KpiStrip,
  KpiCell,
  PressureBanner,
  EmptySlate,
  Skeleton,
  SkeletonPanel,
  SkeletonKpiStrip,
  DataTable,
  DataTh,
  DataTd,
  AlertRow,
} from '@/components/ds/shell'
