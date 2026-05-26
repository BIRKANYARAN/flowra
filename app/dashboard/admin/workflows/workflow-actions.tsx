'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  workflowId: string
}

export default function WorkflowActions({ workflowId }: Props) {
  const router   = useRouter()
  const [working, setWorking]   = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function resolve(action: 'approve' | 'reject') {
    setWorking(true)
    setFeedback(null)
    try {
      const res  = await fetch(`/api/workflow/${workflowId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error ?? 'Hata oluştu' })
      } else {
        setFeedback({ ok: true, msg: action === 'approve' ? '✓ Onaylandı' : '✕ Reddedildi' })
        setTimeout(() => router.refresh(), 1200)
      }
    } catch {
      setFeedback({ ok: false, msg: 'Ağ hatası' })
    }
    setWorking(false)
  }

  if (feedback?.ok) {
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${feedback.ok ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg-text'}`}>
        {feedback.msg}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1.5 justify-end flex-wrap">
      {feedback && !feedback.ok && (
        <span className="text-[10px] text-neg mr-1">{feedback.msg}</span>
      )}
      <button
        onClick={() => resolve('approve')}
        disabled={working}
        className="text-[10px] font-bold px-2.5 py-1.5 rounded bg-pos text-white hover:bg-pos disabled:opacity-50 transition-colors"
      >
        {working ? '…' : '✓ Onayla'}
      </button>
      <button
        onClick={() => resolve('reject')}
        disabled={working}
        className="text-[10px] font-bold px-2.5 py-1.5 rounded bg-neg-light text-neg border border-neg-light hover:bg-neg-light disabled:opacity-50 transition-colors"
      >
        {working ? '…' : '✕ Reddet'}
      </button>
    </div>
  )
}
