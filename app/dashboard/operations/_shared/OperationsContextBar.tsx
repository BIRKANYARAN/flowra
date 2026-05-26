'use client'

// ── OperationsContextBar — Persistent operations state strip ──────────────────
//
// Bloomberg-style status bar for the Operasyon Merkezi.
// Shows expenses, stock, and burn rate at a glance.

import { useState, useEffect } from 'react'
import { ContextReading, ContextRail, ContextRailSkeleton } from '@/components/ds'
import { fmtDense as fmtK } from '@/lib/format'
import type { CfoMetrics } from '@/lib/finance/cfo-metrics'

export function OperationsContextBar({ companyId }: { companyId: string }) {
  const [data, setData]             = useState<CfoMetrics | null>(null)
  const [pendingExpenses, setPendingExpenses] = useState<number | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    Promise.all([
      fetch('/api/cfo-metrics',             { signal }).then(r => r.ok ? r.json() : null),
      fetch('/api/expenses/pending-total',  { signal }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([metrics, pending]) => {
      if (metrics) setData(metrics as CfoMetrics)
      if (pending?.total != null) setPendingExpenses(pending.total)
    }).catch(e => { if (e?.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [companyId])

  if (loading) return <ContextRailSkeleton />
  if (!data) return null

  const burn     = data.burn.monthly_burn_rate
  const stock    = data.stock.fifo_value
  const coverage = data.stock.coverage_months

  return (
    <ContextRail>
      <ContextReading
        label="AYLIK BURN"
        value={burn > 0 ? fmtK(burn) : '—'}
        sub={burn > 0 ? 'aylık gider' : 'Zarar yok'}
        status={burn > 500_000 ? 'warn' : 'ok'}
        border={false}
      />
      <ContextReading
        label="ÖDENECEK GİDER"
        value={pendingExpenses != null && pendingExpenses > 0 ? fmtK(pendingExpenses) : '—'}
        sub={pendingExpenses != null && pendingExpenses > 0 ? 'ödeme bekliyor' : 'Yok'}
        status={pendingExpenses != null && pendingExpenses > 100_000 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="STOK DEĞERİ"
        value={stock > 0 ? fmtK(stock) : '—'}
        sub={stock > 0 ? 'FIFO değeri' : 'Boş'}
        status="ok"
      />
      <ContextReading
        label="STOK KARŞILAMA"
        value={coverage != null ? `${coverage.toFixed(1)}ay` : '—'}
        sub={coverage != null
          ? coverage < 1 ? 'Kritik düşük' : coverage < 2 ? 'Baskı' : 'Yeterli'
          : undefined}
        status={coverage == null ? 'ok' : coverage < 1 ? 'critical' : coverage < 2 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="RUNWAY"
        value={data.burn.runway_months != null
          ? data.burn.runway_months >= 12
            ? `${Math.round(data.burn.runway_months)}ay`
            : `${Math.round(data.burn.runway_months * 30)}g`
          : '—'}
        sub={data.burn.runway_months != null && data.burn.runway_months < 3 ? 'Kritik' : undefined}
        status={data.burn.runway_months == null ? 'ok'
              : data.burn.runway_months < 2 ? 'critical'
              : data.burn.runway_months < 6 ? 'warn'
              : 'ok'}
      />
    </ContextRail>
  )
}
