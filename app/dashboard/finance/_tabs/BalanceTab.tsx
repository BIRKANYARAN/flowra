// ── BalanceTab — Bilanço (Balance Sheet) ─────────────────────────────────────
//
// Authoritative balance sheet via BalanceSheetService.compute().
// Includes FIFO inventory, per-partner capital lines, partner loans,
// estimated tax payable, current-period P&L, and balanced invariant check.
// Two-column layout: Varlıklar (Assets) | Kaynaklar (Liabilities + Equity)

import Link                     from 'next/link'
import { createClient }        from '@/lib/supabase-server'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { fmtTRY as fmt }       from '@/lib/format'
import type { BalanceSheet }   from '@/types/dto'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmtFull(n: number): string {
  return (n < 0 ? '−' : '') + '₺' + TRY_FMT.format(Math.abs(n))
}

// ── Row types ─────────────────────────────────────────────────────────────────

type Row = {
  label:    string
  amount:   number
  indent?:  boolean
  isTotal?: boolean
  isGrand?: boolean
  sub?:     string        // sub-label (e.g. hisse oranı)
  zero?:    boolean       // show "—" when amount === 0
}

// ── Column renderer ────────────────────────────────────────────────────────────

function BSColumn({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{title}</span>
      </div>
      <div className="flex-1 divide-y divide-gray-50 px-4 py-2">
        {rows.map((row, i) => (
          <div key={i} className={`flex items-center justify-between py-2 gap-2 ${row.isGrand ? 'border-t-2 border-gray-200 mt-1' : ''}`}>
            <div className="min-w-0 flex-1">
              <span className={`text-xs leading-snug ${
                row.isGrand  ? 'font-black text-gray-900 text-[13px]' :
                row.isTotal  ? 'font-black text-gray-700' :
                row.indent   ? 'text-gray-400 pl-4 font-medium' :
                               'text-gray-700 font-semibold'
              }`}>{row.label}</span>
              {row.sub && <span className="text-[9px] text-gray-300 ml-1.5">{row.sub}</span>}
            </div>
            <span className={`tabular-nums shrink-0 text-xs ${
              row.isGrand  ? 'font-black text-gray-900 text-[13px]' :
              row.isTotal  ? 'font-bold text-gray-800' :
              row.indent   ? 'font-semibold text-gray-600' :
              row.amount < 0 ? 'font-bold text-red-600' : 'font-bold text-gray-700'
            }`}>
              {(row.zero && row.amount === 0) ? '—' : fmtFull(row.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Row builders ──────────────────────────────────────────────────────────────

function buildAssetRows(bs: BalanceSheet): Row[] {
  const a = bs.assets
  const rows: Row[] = [
    { label: 'Dönen Varlıklar', amount: a.total_current_try, isTotal: true },
    { label: 'Kasa ve Bankalar',  amount: a.cash_try,         indent: true, zero: true },
    { label: 'Ticari Alacaklar',  amount: a.receivables_try,  indent: true, zero: true },
    { label: 'Stok (FIFO)',        amount: a.inventory_try,    indent: true, zero: true },
  ]
  if (a.other_current_try > 0) {
    rows.push({ label: 'Diğer Dönen Varlıklar', amount: a.other_current_try, indent: true })
  }
  // Non-current assets (usually 0 until equipment tracking)
  if (a.total_non_current_try > 0) {
    rows.push({ label: 'Duran Varlıklar', amount: a.total_non_current_try, isTotal: true })
    if (a.equipment_try > 0)         rows.push({ label: 'Maddi Duran Varlıklar', amount: a.equipment_try,  indent: true })
    if (a.deposits_try > 0)          rows.push({ label: 'Depozitolar',           amount: a.deposits_try,   indent: true })
    if (a.other_non_current_try > 0) rows.push({ label: 'Diğer Duran',           amount: a.other_non_current_try, indent: true })
  }
  rows.push({ label: 'TOPLAM VARLIKLAR', amount: a.total_assets_try, isGrand: true })
  return rows
}

function buildLiabEquityRows(bs: BalanceSheet): Row[] {
  const l = bs.liabilities
  const e = bs.equity
  const rows: Row[] = []

  // ── Liabilities ──────────────────────────────────────────────────────────────
  rows.push({ label: 'Kısa Vadeli Yükümlülükler', amount: l.total_current_try, isTotal: true })
  if (l.partner_loans_try > 0)
    rows.push({ label: 'Ortaklara Borçlar (K.V.)',   amount: l.partner_loans_try,           indent: true })
  if (l.tax_payable_try > 0)
    rows.push({ label: 'Vergi Yükümlülükleri',        amount: l.tax_payable_try,             indent: true })
  if (l.other_current_payables_try > 0)
    rows.push({ label: 'Diğer Kısa Vadeli Borçlar',  amount: l.other_current_payables_try,  indent: true })
  if (l.total_current_try === 0)
    rows.push({ label: 'Kısa Vadeli Borç Yok',       amount: 0, indent: true, zero: true })

  if (l.total_non_current_try > 0) {
    rows.push({ label: 'Uzun Vadeli Yükümlülükler', amount: l.total_non_current_try, isTotal: true })
    if (l.partner_loans_long_term_try > 0)
      rows.push({ label: 'Ortaklara Borçlar (U.V.)', amount: l.partner_loans_long_term_try, indent: true })
    if (l.other_non_current_try > 0)
      rows.push({ label: 'Diğer Uzun Vadeli',        amount: l.other_non_current_try,       indent: true })
  }

  rows.push({ label: 'Toplam Yabancı Kaynaklar', amount: l.total_liabilities_try, isTotal: true })

  // ── Equity ───────────────────────────────────────────────────────────────────
  rows.push({ label: 'Özsermaye', amount: e.total_equity_try, isTotal: true })

  // Per-partner capital lines (show up to 4 individually, else just total)
  if (e.partner_capital_lines.length > 0 && e.partner_capital_lines.length <= 4) {
    for (const p of e.partner_capital_lines) {
      rows.push({
        label:  p.partner_name,
        amount: p.capital_try,
        indent: true,
        sub:    `%${(p.share_ratio * 100).toFixed(0)}`,
        zero:   true,
      })
    }
  } else if (e.partner_capital_lines.length > 4) {
    rows.push({ label: 'Ortak Sermayeleri', amount: e.total_partner_capital_try, indent: true })
  }

  if (e.retained_earnings_try !== 0)
    rows.push({ label: 'Geçmiş Yıl Kârları', amount: e.retained_earnings_try, indent: true })
  rows.push({ label: 'Dönem Net Kârı/Zararı', amount: e.current_period_profit_try, indent: true, zero: true })

  rows.push({ label: 'TOPLAM KAYNAKLAR', amount: l.total_liabilities_try + e.total_equity_try, isGrand: true })
  return rows
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function BalanceTab({ userId, companyId }: Props) {
  const today   = new Date().toISOString().slice(0, 10)
  const supabase = createClient()

  const FALLBACK: BalanceSheet = {
    as_of_date: today, computed_at: today,
    assets:      { cash_try: 0, receivables_try: 0, inventory_try: 0, other_current_try: 0, total_current_try: 0, equipment_try: 0, deposits_try: 0, other_non_current_try: 0, total_non_current_try: 0, total_assets_try: 0 },
    liabilities: { partner_loans_try: 0, tax_payable_try: 0, other_current_payables_try: 0, total_current_try: 0, partner_loans_long_term_try: 0, other_non_current_try: 0, total_non_current_try: 0, total_liabilities_try: 0 },
    equity:      { partner_capital_lines: [], total_partner_capital_try: 0, retained_earnings_try: 0, current_period_profit_try: 0, total_equity_try: 0 },
    balanced: true, imbalance_try: 0,
  }

  const bs = await BalanceSheetService.compute(userId, companyId, today, supabase).catch(() => FALLBACK)

  const assetRows   = buildAssetRows(bs)
  const liabEqRows  = buildLiabEquityRows(bs)
  const diff        = Math.abs(bs.imbalance_try)

  // ── Financial health ratios ───────────────────────────────────────────────
  const totalAssets      = bs.assets.total_assets_try
  const totalLiabilities = bs.liabilities.total_liabilities_try
  const currentLiab      = bs.liabilities.total_current_try
  const equity           = bs.equity.total_equity_try
  const cash             = bs.assets.cash_try
  const currentAssets    = bs.assets.total_current_try

  const leverageRatio    = totalAssets > 0 ? totalLiabilities / totalAssets : 0
  const currentRatio     = currentLiab > 0 ? currentAssets / currentLiab : null
  const negativeEquity   = equity < 0 && totalAssets > 0

  return (
    <div className="space-y-4">

      {/* Negative equity — critical solvency alert */}
      {negativeEquity && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-base mt-0.5">🔴</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-red-800">
              Negatif Özsermaye — Teknik İflas Riski
            </div>
            <div className="text-xs text-red-700 mt-0.5">
              Özsermaye <strong>{fmt(equity)}</strong>. Toplam yükümlülükler varlıkları aşıyor.
              Sermaye artırımı veya borç yeniden yapılandırması değerlendirilmeli.
            </div>
          </div>
          <Link href="/dashboard/partners" className="text-[10px] font-bold text-red-700 hover:text-red-800 underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap">
            Ortak Sermayesi →
          </Link>
        </div>
      )}

      {/* High leverage warning */}
      {!negativeEquity && leverageRatio > 0.65 && totalLiabilities > 0 && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
          leverageRatio > 0.80 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1">
            <div className={`text-[11px] font-black uppercase tracking-wide ${leverageRatio > 0.80 ? 'text-red-800' : 'text-amber-800'}`}>
              {leverageRatio > 0.80 ? 'Yüksek Finansal Kaldıraç' : 'Kaldıraç Oranı Dikkat Sınırında'}
            </div>
            <div className={`text-xs mt-0.5 ${leverageRatio > 0.80 ? 'text-red-700' : 'text-amber-700'}`}>
              Toplam borç/varlık oranı <strong>%{(leverageRatio * 100).toFixed(0)}</strong>.
              Yabancı kaynaklar: {fmt(totalLiabilities)} · Özsermaye: {fmt(equity)}.
              {leverageRatio > 0.80 ? ' Kredi kapasitesi sınırlı.' : ' Borç yönetimine dikkat.'}
            </div>
          </div>
        </div>
      )}

      {/* Low current ratio warning */}
      {currentRatio !== null && currentRatio < 1.0 && currentLiab > 10_000 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-orange-800">
              Düşük Likidite — Cari Oran {currentRatio.toFixed(2)}
            </div>
            <div className="text-xs text-orange-700 mt-0.5">
              Dönen varlıklar ({fmt(currentAssets)}) kısa vadeli borçları ({fmt(currentLiab)}) karşılamıyor.
              Nakit: {fmt(cash)} · Alacaklar: {fmt(bs.assets.receivables_try)}.
            </div>
          </div>
          <Link href="/dashboard/finance?tab=cashflow" className="text-[10px] font-bold text-orange-700 hover:text-orange-800 underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap">
            Nakit Akışı →
          </Link>
        </div>
      )}

      {/* Header KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Toplam Varlıklar',     value: fmt(bs.assets.total_assets_try),      color: 'text-gray-900' },
          { label: 'Yabancı Kaynaklar',    value: fmt(bs.liabilities.total_liabilities_try), color: bs.liabilities.total_liabilities_try > 0 ? 'text-amber-700' : 'text-gray-400' },
          { label: 'Özsermaye',            value: fmt(bs.equity.total_equity_try),       color: bs.equity.total_equity_try >= 0 ? 'text-emerald-700' : 'text-red-600' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Two-column balance sheet */}
      <div className="grid grid-cols-2 gap-4">
        <BSColumn title="Varlıklar (Assets)" rows={assetRows} />
        <BSColumn title="Kaynaklar (Liabilities + Equity)" rows={liabEqRows} />
      </div>

      {/* Balanced invariant check */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold ${
        bs.balanced
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          : 'bg-amber-50 border border-amber-200 text-amber-700'
      }`}>
        {bs.balanced ? (
          <>✓ Bilanço dengeli — Varlıklar = Kaynaklar ({fmtFull(bs.assets.total_assets_try)})</>
        ) : (
          <>⚠ Bilanço farkı: {fmtFull(diff)} — Bazı kalemler sisteme girilmemiş olabilir (duran varlıklar, tahakkuklar).</>
        )}
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Bilanço tarihi: {bs.as_of_date} · Duran varlıklar ve uzun vadeli tahakkuklar henüz izlenmemektedir.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/partners" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Ortak Özkaynakları →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=cashflow" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Nakit →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/reports/balance-sheet" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Bilanço Raporu →
          </Link>
        </div>
      </div>
    </div>
  )
}
