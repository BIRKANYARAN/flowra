'use client'

// ── CommercialContextBar — Persistent commercial state strip ──────────────────
//
// Bloomberg-style status bar for the Ticari Akış Merkezi.
// Shows key receivables, proformas, and collections state at a glance.

import { useState, useEffect } from 'react'
import { ContextReading, ContextRail, ContextRailSkeleton } from '@/components/ds'
import { fmtDense as fmtK } from '@/lib/format'

interface CommercialPeek {
  receivables: { total_outstanding: number; overdue_60d: number }
  cash: { true_cash_position: number }
}

interface ProformaSummary {
  open_count:        number
  pending_value_try: number
}

export function CommercialContextBar({ companyId }: { companyId: string }) {
  const [data,    setData]    = useState<CommercialPeek | null>(null)
  const [pfSummary, setPfSummary] = useState<ProformaSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/cfo-metrics').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/proformas/summary').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([metrics, pf]) => {
      if (metrics) setData(metrics as CommercialPeek)
      if (pf?.open_count != null) setPfSummary(pf as ProformaSummary)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [companyId])

  if (loading) return <ContextRailSkeleton />
  if (!data) return null

  const overdue60   = data.receivables.overdue_60d
  const outstanding = data.receivables.total_outstanding
  const collectionRatePct = outstanding > 0
    ? Math.round(((outstanding - overdue60) / outstanding) * 100)
    : 100

  return (
    <ContextRail>
      <ContextReading
        label="AÇIK ALACAK"
        value={outstanding > 0 ? fmtK(outstanding) : '—'}
        sub={outstanding > 0 ? 'toplam bekleyen' : 'Temiz'}
        status={outstanding > 200_000 ? 'warn' : 'ok'}
        border={false}
      />
      <ContextReading
        label="60G+ GECİKMİŞ"
        value={overdue60 > 0 ? fmtK(overdue60) : '—'}
        sub={overdue60 > 0 ? 'kritik risk' : 'Yok'}
        status={overdue60 > 50_000 ? 'critical' : overdue60 > 0 ? 'warn' : 'ok'}
      />
      <ContextReading
        label="TAHSİLAT ORANI"
        value={`%${collectionRatePct}`}
        sub={collectionRatePct >= 80 ? 'Sağlıklı' : collectionRatePct >= 50 ? 'Orta' : 'Zayıf'}
        status={collectionRatePct >= 80 ? 'ok' : collectionRatePct >= 50 ? 'warn' : 'critical'}
      />
      <ContextReading
        label="PROFORMA"
        value={pfSummary != null ? String(pfSummary.open_count) : '—'}
        sub={pfSummary != null && pfSummary.pending_value_try > 0
          ? `${fmtK(pfSummary.pending_value_try)} beklemede`
          : pfSummary != null ? 'açık teklif' : undefined}
        status="ok"
      />
      <ContextReading
        label="NAKİT"
        value={fmtK(data.cash.true_cash_position)}
        sub="mevcut pozisyon"
        status={data.cash.true_cash_position < 50_000 ? 'critical'
              : data.cash.true_cash_position < 200_000 ? 'warn' : 'ok'}
      />
    </ContextRail>
  )
}
