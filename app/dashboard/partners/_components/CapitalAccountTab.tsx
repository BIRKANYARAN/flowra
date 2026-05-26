'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CapitalAccountTab — Sermaye Hesabı
//
// Per-partner capital account statement showing:
//   ACCOUNTING FACTS:
//     - Equity contributed
//     - Total received (distributions + loan repayments)
//     - Net invested position
//     - Book equity value (share_ratio × total equity)
//     - Loan balance (outstanding partner loans)
//     - Net position (book equity − loan balance)
//
//   HYPOTHETICAL SIMULATION:
//     - Exit waterfall at user-specified valuation multiple
//
// Design principle: Accounting facts and simulation sections are visually
// separated so there is zero ambiguity about what is historical fact vs
// hypothetical projection.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { PartnerCapitalAccount, ExitScenario } from '@/lib/services/pcle/capital-account.service'

// ── API response shape ────────────────────────────────────────────────────────

interface CapitalAccountApiResponse {
  accounts:               PartnerCapitalAccount[]
  exit_scenario:          ExitScenario
  total_equity_try:       number
  total_partner_debt_try: number
  computed_at:            string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccountRow({ label, value, sub, indent = false, bold = false, tone }: {
  label:   string
  value:   number | string
  sub?:    string
  indent?: boolean
  bold?:   boolean
  tone?:   'positive' | 'negative' | 'neutral' | 'warning'
}) {
  const toneClass =
    tone === 'positive' ? 'text-[#16a34a]' :
    tone === 'negative' ? 'text-[#dc2626]' :
    tone === 'warning'  ? 'text-[#d97706]' :
    'text-[#0f172a]'

  return (
    <div className={[
      'flex items-baseline justify-between py-2 border-b border-[#f1f5f9] last:border-0',
      indent ? 'pl-4' : '',
    ].join(' ')}>
      <div>
        <div className={['text-xs', bold ? 'font-semibold text-[#0f172a]' : 'text-[#475569]'].join(' ')}>
          {label}
        </div>
        {sub && <div className="text-[0.65rem] text-[#94a3b8] mt-0.5">{sub}</div>}
      </div>
      <div className={['text-xs tabular-nums', bold ? 'font-bold' : 'font-medium', toneClass].join(' ')}>
        {typeof value === 'number' ? fmtTRY(value) : value}
      </div>
    </div>
  )
}

function PartnerCard({ acc }: { acc: PartnerCapitalAccount }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-[#0f172a]">{acc.partner_name}</div>
          <div className="text-[0.65rem] text-[#94a3b8] mt-0.5">
            Pay: {fmtPct(acc.share_ratio * 100)}
            {!acc.is_active && ' · Pasif'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Net Pozisyon</div>
          <div className={[
            'text-base font-black tabular-nums',
            acc.net_position_try >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]',
          ].join(' ')}>
            {fmtTRY(acc.net_position_try)}
          </div>
        </div>
      </div>

      {/* Accounting facts */}
      <div className="px-4 py-1">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] py-2">
          Muhasebe Gerçekleri
        </div>

        <AccountRow
          label="Sermaye Katkısı"
          value={acc.equity_contributed_try}
          sub="EQUITY_PAYMENT olayları toplamı"
          bold
        />
        <AccountRow
          label="Dağıtım Alınan"
          value={acc.distributions_received_try}
          sub="Temettü + Tazminat ödemeleri"
          indent
          tone={acc.distributions_received_try > 0 ? 'negative' : 'neutral'}
        />
        <AccountRow
          label="Geri Ödeme Alınan"
          value={acc.loan_repayments_received_try}
          sub="Borç geri ödemeleri"
          indent
          tone={acc.loan_repayments_received_try > 0 ? 'negative' : 'neutral'}
        />
        <AccountRow
          label="Toplam Alınan"
          value={acc.total_received_try}
          sub="Dağıtım + Geri ödemeler"
          bold
          tone={acc.total_received_try > 0 ? 'negative' : 'neutral'}
        />

        <div className="my-1 border-t border-[#e2e8f0]" />

        <AccountRow
          label="Net Yatırım Pozisyonu"
          value={acc.net_invested_try}
          sub="Sermaye katkısı − Toplam alınan"
          bold
          tone={acc.net_invested_try > 0 ? 'warning' : 'positive'}
        />

        <div className="my-1 border-t border-[#e2e8f0]" />

        <AccountRow
          label="Defter Öz Sermaye Değeri"
          value={acc.book_equity_try}
          sub={`Pay oranı (${fmtPct(acc.share_ratio * 100)}) × Toplam öz sermaye`}
          bold
          tone={acc.book_equity_try >= 0 ? 'positive' : 'negative'}
        />
        <AccountRow
          label="Borç Bakiyesi"
          value={acc.loan_balance_try}
          sub="Aktif tranche bakiyeleri toplamı"
          tone={acc.loan_balance_try > 0 ? 'negative' : 'neutral'}
        />

        <div className="my-1 border-t border-[#e2e8f0]" />

        <AccountRow
          label="Net Pozisyon"
          value={acc.net_position_try}
          sub="Defter öz sermaye − Borç bakiyesi"
          bold
          tone={acc.net_position_try >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {/* Narrative footer */}
      <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#e2e8f0]">
        <div className="text-[0.65rem] text-[#94a3b8]">
          Tüm değerler muhasebe kayıtlarından hesaplanmıştır. Gerçek nakit akışını değil defter değerini gösterir.
        </div>
      </div>
    </div>
  )
}

// ── Exit Scenario Section ─────────────────────────────────────────────────────

function ExitScenarioSection({
  accounts,
  totalEquity,
  totalDebt,
  multiple,
  onMultipleChange,
}: {
  accounts:          PartnerCapitalAccount[]
  totalEquity:       number
  totalDebt:         number
  multiple:          number
  onMultipleChange:  (v: number) => void
}) {
  // Compute locally so we can simulate without a server round-trip
  const enterpriseValue  = totalEquity * multiple
  const seniorClaims     = Math.max(0, totalDebt)
  const distributable    = Math.max(0, enterpriseValue - seniorClaims)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
      {/* Section header — visually distinct from accounting facts */}
      <div className="px-4 py-3 bg-[#fffbeb] border-b border-[#fde68a] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#d97706]">
            Hipotetik Simülasyon
          </div>
          <div className="text-sm font-bold text-[#92400e] mt-0.5">Çıkış Senaryo Analizi</div>
          <div className="text-[0.65rem] text-[#d97706] mt-1 max-w-xl">
            Bu bölüm gerçek bir değerleme değildir. Kullanıcı tarafından girilen çarpan üzerinden
            hesaplanan hipotetik bir dağıtım simülasyonudur.
          </div>
        </div>

        {/* Multiple input */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#92400e]">
            Değerleme Çarpanı
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.1}
              value={multiple}
              onChange={e => onMultipleChange(parseFloat(e.target.value))}
              className="w-24 accent-[#d97706]"
            />
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={multiple}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (Number.isFinite(v) && v > 0) onMultipleChange(v)
              }}
              className="w-16 text-xs border border-[#fde68a] bg-white rounded px-2 py-1 text-[#92400e] font-bold tabular-nums"
            />
            <span className="text-xs text-[#d97706] font-bold">x</span>
          </div>
          <div className="text-[0.65rem] text-[#d97706]">
            Öz sermayenin {multiple.toFixed(1)}x katı
          </div>
        </div>
      </div>

      {/* Summary waterfall */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#fafafa]">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Firma Değeri</div>
            <div className="text-sm font-bold text-[#0f172a] tabular-nums mt-1">{fmtTRY(enterpriseValue)}</div>
            <div className="text-[0.65rem] text-[#94a3b8]">{multiple.toFixed(1)}x × Öz sermaye</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kıdemli Alacaklar</div>
            <div className="text-sm font-bold text-[#dc2626] tabular-nums mt-1">{fmtTRY(seniorClaims)}</div>
            <div className="text-[0.65rem] text-[#94a3b8]">Ortak borçları</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dağıtılabilir</div>
            <div className="text-sm font-bold text-[#16a34a] tabular-nums mt-1">{fmtTRY(distributable)}</div>
            <div className="text-[0.65rem] text-[#94a3b8]">Kıdemli talepler sonrası</div>
          </div>
        </div>
      </div>

      {/* Per-partner exit values */}
      <div className="divide-y divide-[#f1f5f9]">
        {accounts.map(acc => {
          const exitValue    = distributable * acc.share_ratio
          const netExitGain  = exitValue - acc.net_invested_try

          return (
            <div key={acc.partner_id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#0f172a]">{acc.partner_name}</div>
                <div className="text-[0.65rem] text-[#94a3b8]">
                  {fmtPct(acc.share_ratio * 100)} · Net yatırım: {fmtTRY(acc.net_invested_try)}
                </div>
              </div>
              <div className="text-right flex gap-6">
                <div>
                  <div className="text-[0.65rem] text-[#94a3b8]">Çıkış Değeri</div>
                  <div className="text-xs font-bold tabular-nums text-[#0f172a]">{fmtTRY(exitValue)}</div>
                </div>
                <div>
                  <div className="text-[0.65rem] text-[#94a3b8]">Net Kazanç</div>
                  <div className={[
                    'text-xs font-bold tabular-nums',
                    netExitGain >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]',
                  ].join(' ')}>
                    {netExitGain >= 0 ? '+' : ''}{fmtTRY(netExitGain)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Disclaimer */}
      <div className="px-4 py-2 bg-[#fffbeb] border-t border-[#fde68a]">
        <div className="text-[0.65rem] text-[#d97706]">
          UYARI: Bu simülasyon hipotetik bir senaryodur. Gerçek piyasa değeri, likidite primi,
          kontrol primi ve diğer faktörler bu hesaplamada dikkate alınmamıştır. Yatırım tavsiyesi değildir.
        </div>
      </div>
    </div>
  )
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function CapitalAccountTab() {
  const [multiple, setMultiple] = useState(1.5)

  const { data, isLoading, error } = useQuery<CapitalAccountApiResponse>({
    queryKey: ['capital-account'],
    queryFn: async () => {
      const res = await fetch('/api/partners/capital-account')
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<CapitalAccountApiResponse>
    },
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton height="h-8" />
        <Skeleton height="h-64" />
        <Skeleton height="h-48" />
      </div>
    )
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : 'Sermaye hesabı verileri alınamadı'
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 text-xs text-[#dc2626] font-medium">
        {msg}
      </div>
    )
  }

  const { accounts, total_equity_try, total_partner_debt_try } = data

  if (accounts.length === 0) {
    return (
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-8 text-center text-sm text-[#94a3b8]">
        Henüz ortak verisi bulunamadı.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2.5 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Öz Sermaye</div>
          <div className="text-sm font-black text-[#0f172a] tabular-nums mt-1">{fmtTRY(total_equity_try)}</div>
          <div className="text-[0.65rem] text-[#94a3b8]">Defter değeri</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2.5 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ortak Borç Bakiyesi</div>
          <div className="text-sm font-black text-[#dc2626] tabular-nums mt-1">{fmtTRY(total_partner_debt_try)}</div>
          <div className="text-[0.65rem] text-[#94a3b8]">Aktif trancheler</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-3 py-2.5 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Net Öz Sermaye</div>
          <div className={[
            'text-sm font-black tabular-nums mt-1',
            (total_equity_try - total_partner_debt_try) >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]',
          ].join(' ')}>
            {fmtTRY(total_equity_try - total_partner_debt_try)}
          </div>
          <div className="text-[0.65rem] text-[#94a3b8]">Öz sermaye − Borç</div>
        </div>
      </div>

      {/* Section label */}
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        Ortak Bazında Sermaye Hesapları — Muhasebe Gerçekleri
      </div>

      {/* Per-partner account cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {accounts.map(acc => (
          <PartnerCard key={acc.partner_id} acc={acc} />
        ))}
      </div>

      {/* Exit scenario */}
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        Hipotetik Çıkış Senaryosu — Simülasyon
      </div>

      <ExitScenarioSection
        accounts={accounts}
        totalEquity={total_equity_try}
        totalDebt={total_partner_debt_try}
        multiple={multiple}
        onMultipleChange={setMultiple}
      />

      {/* Footer */}
      <div className="text-[0.65rem] text-[#94a3b8]">
        Son hesaplama: {new Date(data.computed_at).toLocaleString('tr-TR')}
      </div>
    </div>
  )
}
