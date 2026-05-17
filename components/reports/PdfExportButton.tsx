'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/reports/PdfExportButton.tsx
//
// Generic PDF export button that wraps lib/utils/pdf-report.generatePdfReport.
// Falls back to window.print() if jspdf fails.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { PdfReportOptions } from '@/lib/utils/pdf-report'

interface Props {
  opts:    PdfReportOptions
  label?:  string
  variant?: 'default' | 'ghost'
}

export function PdfExportButton({ opts, label = 'PDF İndir', variant = 'default' }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const { generatePdfReport } = await import('@/lib/utils/pdf-report')
      await generatePdfReport(opts)
    } catch (e) {
      console.warn('[PdfExportButton] jspdf failed, falling back to print:', e)
      window.print()
    } finally {
      setLoading(false)
    }
  }

  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors print:hidden disabled:opacity-60'
  const cls = variant === 'ghost'
    ? `${base} text-gray-600 hover:bg-gray-100 border border-gray-200`
    : `${base} bg-gray-900 text-white hover:bg-gray-700`

  return (
    <button onClick={handleClick} disabled={loading} className={cls}>
      {loading ? (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
          <path d="M20 18H4v2h16v-2z" />
        </svg>
      )}
      {loading ? 'Oluşturuluyor…' : label}
    </button>
  )
}
