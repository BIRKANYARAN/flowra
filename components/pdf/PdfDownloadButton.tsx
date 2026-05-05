'use client'

import { useState } from 'react'
import { Btn } from '@/components/ui'
import { generatePdf } from '@/components/pdf/generatePdf'
import type { PdfOptions } from '@/components/pdf/generatePdf'

interface Props {
  opts: PdfOptions
}

export function PdfDownloadButton({ opts }: Props) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function download() {
    setLoading(true); setError('')
    try {
      await generatePdf(opts)
    } catch (err) {
      console.error('PDF error:', err)
      setError('PDF oluşturulamadı.')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Btn onClick={download} disabled={loading} variant="secondary" small>
        {loading
          ? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Hazırlanıyor...</>
          : '↓ PDF İndir'
        }
      </Btn>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
