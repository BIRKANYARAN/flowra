'use client'

/**
 * PrintButton — triggers window.print() for simple print-to-PDF flow.
 * For branded PDF exports with jspdf, use PdfExportButton instead.
 */
export function PrintButton({ label = 'PDF İndir' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors print:hidden"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
        <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
        <path d="M20 18H4v2h16v-2z" />
      </svg>
      {label}
    </button>
  )
}
