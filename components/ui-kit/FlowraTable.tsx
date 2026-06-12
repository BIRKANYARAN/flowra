'use client'
// FlowraTable — consistent data table shell matching design system spec.
// Handles: empty state, loading skeleton, sticky header, hover rows.

import { ReactNode } from 'react'
import { cn, LoadingSpinner, EmptyState } from '@/components/ui'

/* ── Column definition ─────────────────────────────────────────────────── */
export interface FlowraColumn<T = unknown> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  className?: string
  render: (row: T, i: number) => ReactNode
}

/* ── Props ─────────────────────────────────────────────────────────────── */
interface FlowraTableProps<T = unknown> {
  columns: FlowraColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string
  emptyIcon?: string
  emptyTitle?: string
  emptySub?: string
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
  className?: string
  /** Optional footer slot inside the card */
  footer?: ReactNode
}

/* ── Component ─────────────────────────────────────────────────────────── */
export function FlowraTable<T>({
  columns, rows, rowKey, loading, error, emptyIcon = '📄',
  emptyTitle = 'Kayıt bulunamadı', emptySub, emptyAction,
  onRowClick, className, footer,
}: FlowraTableProps<T>) {

  if (loading) return <LoadingSpinner />

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-light text-neg-text px-4 py-3 rounded text-sm">
        {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        sub={emptySub}
        action={emptyAction}
      />
    )
  }

  return (
    <div className={cn('bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-5 py-3 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]',
                  col.align === 'right'  && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {rows.map((row, i) => (
            <tr
              key={rowKey(row)}
              className={cn(
                'hover:bg-[#f8fafc]/60 transition-colors',
                onRowClick && 'cursor-pointer',
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={cn(
                    'px-5 py-3',
                    col.align === 'right'  && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.className,
                  )}
                >
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && (
        <div className="border-t border-[#e8eaef] px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  )
}
