'use client'

export function PrintButton({ label = 'PDF İndir' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors print:hidden"
    >
      ↓ {label}
    </button>
  )
}
