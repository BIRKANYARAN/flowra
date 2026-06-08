'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] unhandled error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-10 max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-black text-[#0f172a] mb-2">Bir hata oluştu</h2>
        <p className="text-sm text-[#64748b] mb-4">
          Sayfa yüklenirken beklenmeyen bir hata meydana geldi.
        </p>
        {error?.message && process.env.NODE_ENV !== 'production' && (
          <p className="text-xs text-[#94a3b8] font-mono bg-[#f8fafc] rounded p-3 mb-4 break-all max-h-24 overflow-auto text-left">
            {error.message}
          </p>
        )}
        {error?.digest && (
          <p className="text-xs text-[#cbd5e1] mb-4 font-mono">digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="bg-brand-light text-white px-5 py-2.5 rounded text-sm font-semibold hover:bg-brand transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
