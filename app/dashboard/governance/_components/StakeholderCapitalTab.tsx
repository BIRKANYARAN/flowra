'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/components/ui'
import { fmtTRY } from '@/lib/format'
import type {
  StakeholderCapitalSummary,
  StakeholderCapitalAccount,
} from '@/lib/services/governance/stakeholder-capital.service'
import {
  classifyCapitalHealth,
} from '@/lib/services/governance/stakeholder-capital.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function healthBadge(unpaid: number, loan: number, sharePct: number) {
  const health = classifyCapitalHealth(unpaid, loan, sharePct)
  if (health === 'critical')  return { label: 'Kritik',    cls: 'bg-red-100 text-red-700 border border-red-200' }
  if (health === 'attention') return { label: 'Dikkat',    cls: 'bg-amber-100 text-amber-700 border border-amber-200' }
  return                             { label: 'Sağlıklı',  cls: 'bg-green-100 text-green-700 border border-green-200' }
}

function burdenBadgeClass(score: number): string {
  if (score > 15)  return 'bg-red-50 text-red-600 border border-red-200'
  if (score > 5)   return 'bg-amber-50 text-amber-600 border border-amber-200'
  if (score < -5)  return 'bg-blue-50 text-blue-600 border border-blue-200'
  return 'bg-gray-50 text-gray-500 border border-gray-200'
}

function pctFill(paid: number, committed: number): number {
  if (committed <= 0) return 0
  return Math.min(100, Math.round((paid / committed) * 100))
}

// ── Summary Header ─────────────────────────────────────────────────────────────

function SummaryHeader({ summary }: { summary: StakeholderCapitalSummary }) {
  const metrics = [
    { label: 'Toplam Taahhüt', value: fmtTRY(summary.total_committed_try), color: 'text-gray-900' },
    { label: 'Toplam Ödenen',  value: fmtTRY(summary.total_paid_try),      color: 'text-green-700' },
    { label: 'Sermaye Açığı',  value: fmtTRY(summary.equity_gap_try),      color: summary.equity_gap_try > 0 ? 'text-red-600' : 'text-green-700' },
    { label: 'Toplam Krediler', value: fmtTRY(summary.total_loans_try),   color: summary.total_loans_try > 0 ? 'text-amber-700' : 'text-gray-900' },
    { label: 'Dağıtım (YTD)',  value: fmtTRY(summary.total_distributions_ytd_try), color: 'text-violet-700' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {metrics.map(m => (
        <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">{m.label}</p>
          <p className={cn('text-sm font-semibold mt-0.5', m.color)}>{m.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Partner Card ───────────────────────────────────────────────────────────────

function PartnerCapitalCard({ account }: { account: StakeholderCapitalAccount }) {
  const fill   = pctFill(account.paid_try, account.committed_try)
  const badge  = healthBadge(account.unpaid_try, account.loan_outstanding_try, account.share_pct)
  const isPositive = account.net_position_try >= 0

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{account.partner_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">%{account.share_pct.toFixed(2)} pay</p>
        </div>
        <span className={cn('text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0', badge.cls)}>
          {badge.label}
        </span>
      </div>

      {/* Committed vs Paid bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Taahhüt</span>
          <span>{fmtTRY(account.committed_try)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={cn(
              'h-2 rounded-full transition-all duration-500',
              fill === 100 ? 'bg-green-500' : fill > 50 ? 'bg-violet-500' : 'bg-amber-400',
            )}
            style={{ width: `${fill}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-green-700 font-medium">Ödenen: {fmtTRY(account.paid_try)}</span>
          {account.unpaid_try > 0 && (
            <span className="text-red-500">Eksik: {fmtTRY(account.unpaid_try)}</span>
          )}
        </div>
      </div>

      {/* Capital call overdue warning */}
      {account.capital_call_overdue && (
        <div className="flex items-center gap-1.5 text-[11px] bg-red-50 border border-red-200 text-red-700 rounded-lg px-2.5 py-1.5">
          <span>⚠</span>
          <span>Vadesi geçmiş sermaye çağrısı var</span>
        </div>
      )}

      {/* Loan + burden score */}
      {account.loan_outstanding_try > 0 && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Kredi Bakiyesi</p>
            <p className="text-sm font-medium text-amber-700">{fmtTRY(account.loan_outstanding_try)}</p>
          </div>
          <span className={cn('text-[10px] px-2 py-1 rounded font-medium', burdenBadgeClass(account.burden_score))}>
            Yük Skoru: {account.burden_score > 0 ? '+' : ''}{account.burden_score.toFixed(1)} pp
          </span>
        </div>
      )}

      {/* Bottom row: distributions + net position */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-400">Dağıtım (YTD)</p>
          <p className="text-xs font-medium text-violet-700">{fmtTRY(account.distributions_ytd_try)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Net Pozisyon</p>
          <p className={cn('text-sm font-bold', isPositive ? 'text-green-700' : 'text-red-600')}>
            {isPositive ? '+' : ''}{fmtTRY(account.net_position_try)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main Tab Component ─────────────────────────────────────────────────────────

export default function StakeholderCapitalTab() {
  const [summary, setSummary]   = useState<StakeholderCapitalSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [sortByNet, setSortByNet] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/governance/stakeholder-capital')
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? 'Veri alınamadı')
        return
      }
      const d = await r.json()
      setSummary(d.summary)
    } catch {
      setError('Ağ hatası')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-500">Yükleniyor…</div>
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="mt-3 text-xs text-violet-600 hover:underline">Yeniden Dene</button>
      </div>
    )
  }

  if (!summary || summary.accounts.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-2xl mb-3">💰</p>
        <p className="text-sm font-medium text-gray-700">Henüz ortak kaydı yok</p>
        <p className="text-xs text-gray-400 mt-1">Ortaklar eklendikten sonra sermaye hesapları burada görünecek.</p>
      </div>
    )
  }

  const accounts = sortByNet
    ? [...summary.accounts].sort((a, b) => b.net_position_try - a.net_position_try)
    : [...summary.accounts].sort((a, b) => b.share_pct - a.share_pct)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Sermaye Hesapları</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ortak başına sermaye taahhüdü, ödeme ve kredi durumu
          </p>
        </div>
        <button
          onClick={() => setSortByNet(v => !v)}
          className={cn(
            'text-xs px-3 py-1.5 rounded-lg border transition-colors',
            sortByNet
              ? 'bg-violet-600 text-white border-violet-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-violet-400',
          )}
        >
          {sortByNet ? '↕ Net Pozisyon' : '↕ Pay Oranı'}
        </button>
      </div>

      {/* Summary metrics */}
      <SummaryHeader summary={summary} />

      {/* Partner cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {accounts.map(a => (
          <PartnerCapitalCard key={a.partner_id} account={a} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        Son güncelleme: {new Date(summary.computed_at).toLocaleString('tr-TR')}
      </p>
    </div>
  )
}
