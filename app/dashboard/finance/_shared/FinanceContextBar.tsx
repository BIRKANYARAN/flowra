'use client'

// ── FinanceContextBar — Persistent financial state strip for Finance Hub ──────
//
// Always-visible Bloomberg-style status bar showing 6 key readings.
// Sits between the sticky tab nav and the tab content area.
// Loads independently via /api/cfo-metrics.

import { useState, useEffect } from 'react'
import { ContextReading, ContextRail, ContextRailSkeleton } from '@/components/ds'
import { fmtDense as fmtK } from '@/lib/format'

interface CfoPeek {
  cash:        { true_cash_position: number; distributable_cash: number }
  burn:        { runway_days: number | null; runway_months: number | null }
  receivables: { total_outstanding: number; overdue_60d: number }
  tax:         { kdv_net: number; corporate_tax_estimate: number }
  partner:     { total_loans: number }
}

const TRY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function prefixed(n: number): string {
  return (n < 0 ? '−' : '') + '₺' + TRY.format(Math.abs(n))
}

export function FinanceContextBar({ companyId }: { companyId: string }) {
  const [data, setData]     = useState<CfoPeek | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/cfo-metrics')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [companyId])

  if (loading) return <ContextRailSkeleton className="h-[52px]" />

  if (!data) return null

  const runway = data.burn.runway_days ?? -1
  const kdv    = data.tax.kdv_net
  const cash   = data.cash.true_cash_position

  return (
    <ContextRail>
      <ContextReading
        label="NAKİT"
        value={fmtK(cash)}
        sub={data.cash.distributable_cash > 0 ? fmtK(data.cash.distributable_cash) + ' dağıtılabilir' : undefined}
        status={cash < 50_000 ? 'critical' : cash < 200_000 ? 'warn' : 'ok'}
        border={false}
      />
      <ContextReading
        label="RUNWAY"
        value={runway < 0 ? '—' : runway >= 365 ? Math.round(data.burn.runway_months ?? 12) + 'ay' : runway + 'g'}
        sub={runway >= 0 && runway < 90 ? (runway < 30 ? 'Kritik' : 'Baskı altında') : undefined}
        status={runway >= 0 && runway < 30 ? 'critical' : runway >= 0 && runway < 90 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="ALACAK"
        value={fmtK(data.receivables.total_outstanding)}
        sub={data.receivables.overdue_60d > 0 ? fmtK(data.receivables.overdue_60d) + ' 60g+' : 'Güncel'}
        status={data.receivables.overdue_60d > 50_000 ? 'critical' : data.receivables.overdue_60d > 0 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="KDV NET"
        value={prefixed(kdv)}
        sub={kdv > 0 ? 'Ödenecek' : kdv < 0 ? 'Devir' : 'Sıfır'}
        status={kdv > 100_000 ? 'critical' : kdv > 50_000 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="K.VERGİSİ"
        value={fmtK(data.tax.corporate_tax_estimate)}
        status={data.tax.corporate_tax_estimate > 200_000 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="ORTAK BORÇ"
        value={fmtK(data.partner.total_loans)}
        status={data.partner.total_loans > 500_000 ? 'warn' : 'ok'}
      />
    </ContextRail>
  )
}
