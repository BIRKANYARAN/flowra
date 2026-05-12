'use client'
// ── Flowra design-system primitives ────────────────────────────────────────
// New CVA-driven components prepended above the original exports.

import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...args: unknown[]) { return twMerge(clsx(args)) }

/* ── Btn (CVA-driven, replaces the original hand-rolled version) ─────────── */
const btn = cva(
  'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary:   'bg-primary-600 hover:bg-primary-700 text-white shadow-sm',
        secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
        ghost:     'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
        danger:    'bg-red-50 hover:bg-red-100 text-red-700 border border-red-100',
        success:   'bg-emerald-600 hover:bg-emerald-700 text-white',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-5 py-2.5 text-sm',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', fullWidth: false },
  }
)

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btn> & {
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  /** Legacy compat: maps `small` → size="sm", `variant="primary"` with indigo → primary */
  small?: boolean
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant, size, fullWidth, small, leftIcon, rightIcon, className, children, ...rest }, ref) => {
    // Legacy compat: `small` prop maps to size sm
    const resolvedSize = small ? 'sm' : size
    // Legacy compat: old "primary" used indigo — keep primary variant mapped
    const resolvedVariant = (variant as string) === 'danger' && !className?.includes('red')
      ? 'danger'
      : variant
    return (
      <button
        ref={ref}
        className={cn(btn({ variant: resolvedVariant, size: resolvedSize, fullWidth }), className)}
        {...rest}
      >
        {leftIcon}{children}{rightIcon}
      </button>
    )
  }
)
Btn.displayName = 'Btn'

/* ── Card ─────────────────────────────────────────────────────────────────── */
const card = cva('bg-white border border-gray-200 rounded-2xl', {
  variants: {
    padding:     { none: 'p-0', sm: 'p-4', md: 'p-5', lg: 'p-6' },
    interactive: { true: 'hover:border-gray-300 cursor-pointer transition-colors', false: '' },
  },
  defaultVariants: { padding: 'md', interactive: false },
})
export function Card({
  padding, interactive, className, children, id,
}: VariantProps<typeof card> & { className?: string; children: ReactNode; id?: string }) {
  return <div id={id} className={cn(card({ padding, interactive }), className)}>{children}</div>
}

/* ── Label (tiny uppercase) ──────────────────────────────────────────────── */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-[10px] font-bold uppercase tracking-widest text-gray-400', className)}>
      {children}
    </div>
  )
}

/* ── SectionHeader ────────────────────────────────────────────────────────── */
export function SectionHeader({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <Label>{label}</Label>
      {action}
    </div>
  )
}

/* ── Input (design-system styled, with label/prefix/suffix/error) ─────────── */
type DSInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> & {
  label?: string
  prefix?: ReactNode
  suffix?: ReactNode
  error?: string
}
export const DSInput = forwardRef<HTMLInputElement, DSInputProps>(
  ({ label, prefix, suffix, error, className, ...rest }, ref) => (
    <div className={className}>
      {label && <div className="text-xs font-semibold text-gray-700 mb-1.5">{label}</div>}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full bg-white border rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors',
            'focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
            prefix && 'pl-8',
            suffix && 'pr-10',
            error ? 'border-red-300' : 'border-gray-200',
          )}
          {...rest}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
            {suffix}
          </span>
        )}
      </div>
      {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
    </div>
  )
)
DSInput.displayName = 'DSInput'

/* ── StatusBadge ─────────────────────────────────────────────────────────── */
// Accepts BOTH Turkish display strings AND English DB keys.
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  // English DB keys (legacy)
  draft:        { label: 'Taslak',       cls: 'bg-gray-100 text-gray-600' },
  sent:         { label: 'Gönderildi',   cls: 'bg-blue-50 text-blue-700' },
  accepted:     { label: 'Onaylandı',    cls: 'bg-emerald-50 text-emerald-700' },
  rejected:     { label: 'Reddedildi',   cls: 'bg-red-50 text-red-700' },
  converted:    { label: 'Dönüştürüldü', cls: 'bg-primary-50 text-primary-700' },
  paid:         { label: 'Ödendi',       cls: 'bg-emerald-50 text-emerald-700' },
  partial:      { label: 'Kısmi',        cls: 'bg-amber-50 text-amber-700' },
  unpaid:       { label: 'Bekliyor',     cls: 'bg-amber-50 text-amber-700' },
  overdue:      { label: 'Gecikmiş',     cls: 'bg-red-50 text-red-700' },
  completed:    { label: 'Tamamlandı',   cls: 'bg-emerald-50 text-emerald-700' },
  cancelled:    { label: 'İptal',        cls: 'bg-gray-100 text-gray-500' },
  // Turkish display strings (design system native)
  Taslak:       { label: 'Taslak',       cls: 'bg-gray-100 text-gray-600' },
  Gönderildi:   { label: 'Gönderildi',   cls: 'bg-blue-50 text-blue-700' },
  Onaylandı:    { label: 'Onaylandı',    cls: 'bg-emerald-50 text-emerald-700' },
  Reddedildi:   { label: 'Reddedildi',   cls: 'bg-red-50 text-red-700' },
  Dönüştürüldü: { label: 'Dönüştürüldü', cls: 'bg-primary-50 text-primary-700' },
  Bekliyor:     { label: 'Bekliyor',     cls: 'bg-amber-50 text-amber-700' },
  Ödendi:       { label: 'Ödendi',       cls: 'bg-emerald-50 text-emerald-700' },
  Gecikmiş:     { label: 'Gecikmiş',     cls: 'bg-red-50 text-red-700' },
  Tamamlandı:   { label: 'Tamamlandı',   cls: 'bg-emerald-50 text-emerald-700' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold', s.cls)}>
      {s.label}
    </span>
  )
}

/* ── Money ────────────────────────────────────────────────────────────────── */
type MoneyProps = {
  value: number
  currency?: '₺' | '$' | '€' | '£' | string
  decimals?: number
  emphasis?: 'normal' | 'strong' | 'xl' | 'kpi'
  tone?: 'neutral' | 'positive' | 'negative'
  signed?: boolean
  className?: string
}
export function formatMoney(n: number, decimals = 2) {
  return Number(n).toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
export function Money({
  value, currency = '₺', decimals = 2,
  emphasis = 'normal', tone = 'neutral', signed = false, className,
}: MoneyProps) {
  const emph = {
    normal: 'text-sm font-semibold',
    strong: 'text-sm font-bold',
    xl:     'text-lg font-black',
    kpi:    'text-2xl font-black tracking-tight',
  }[emphasis]
  const toneCls = {
    neutral:  'text-gray-900',
    positive: 'text-emerald-700',
    negative: 'text-red-700',
  }[tone]
  const sign = signed && value > 0 ? '+' : signed && value < 0 ? '−' : ''
  const abs  = Math.abs(value)
  return (
    <span className={cn('tabular-nums', emph, toneCls, className)}>
      {sign}
      <span className="mr-0.5 text-gray-400 font-normal">{currency}</span>
      {formatMoney(abs, decimals)}
    </span>
  )
}

// ── ORIGINAL EXPORTS (kept exactly as-is) ────────────────────────────────────

/* ── Stat card ─────────────────────────────────────────────────────────────── */
export function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: boolean
}) {
  return (
    <div className={`bg-white border rounded-2xl p-5 ${accent ? 'border-primary-200 bg-primary-50' : 'border-gray-200'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-primary-500' : 'text-gray-400'}`}>
        {label}
      </div>
      <div className={`text-2xl font-black tabular-nums ${accent ? 'text-primary-700' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

/* ── Page header ─────────────────────────────────────────────────────────── */
export function PageHeader({ title, sub, action }: {
  title: string; sub?: string; action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, sub, action }: {
  icon: string; title: string; sub?: string; action?: ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl text-center py-16 px-6">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="font-semibold text-gray-700 mb-1">{title}</p>
      {sub && <p className="text-sm text-gray-400 mb-5">{sub}</p>}
      {action}
    </div>
  )
}

/* ── Loading ─────────────────────────────────────────────────────────────── */
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/* ── Error banner ────────────────────────────────────────────────────────── */
export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
      {msg}
    </div>
  )
}

/* ── Currency helpers (legacy) ───────────────────────────────────────────── */
export function sym(c: string) {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '₺'
}

export function fmtMoney(n: number, currency = 'TRY') {
  return sym(currency) + Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

export function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return d }
}

/* ── Select (design-system styled) ─────────────────────────────────────── */
type DSSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  error?: string
}
export const DSSelect = forwardRef<HTMLSelectElement, DSSelectProps>(
  ({ label, error, className, children, ...rest }, ref) => (
    <div className={className}>
      {label && <div className="text-xs font-semibold text-gray-700 mb-1.5">{label}</div>}
      <select
        ref={ref}
        className={cn(
          'w-full bg-white border rounded-xl px-3 py-2 text-sm text-gray-900 transition-colors',
          'focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
          error ? 'border-red-300' : 'border-gray-200',
        )}
        {...rest}
      >
        {children}
      </select>
      {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
    </div>
  )
)
DSSelect.displayName = 'DSSelect'
