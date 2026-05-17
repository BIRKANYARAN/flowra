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
      <div className="bg-white border border-gray-100 rounded-2xl p-10 max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-black text-gray-900 mb-2">Bir hata oluştu</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sayfa yüklenirken beklenmeyen bir hata meydana geldi.
        </p>
        {error?.message && process.env.NODE_ENV !== 'production' && (
          <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded-lg p-3 mb-4 break-all max-h-24 overflow-auto text-left">
            {error.message}
          </p>
        )}
        {error?.digest && (
          <p className="text-xs text-gray-300 mb-4 font-mono">digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
