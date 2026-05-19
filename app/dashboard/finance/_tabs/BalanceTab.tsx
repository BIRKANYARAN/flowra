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
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">{title}</span>
      </div>
      <div className="flex-1 divide-y divide-[#f1f5f9] px-4 py-2">
        {rows.map((row, i) => (
          <div key={i} className={`flex items-center justify-between py-2 gap-2 ${row.isGrand ? 'border-t-2 border-[#e2e8f0] mt-1' : ''}`}>
            <div className="min-w-0 flex-1">
              <span className={`text-xs leading-snug ${
                row.isGrand  ? 'font-black text-[#0f172a] text-[13px]' :
                row.isTotal  ? 'font-black text-[#334155]' :
                row.indent   ? 'text-[#94a3b8] pl-4 font-medium' :
                               'text-[#334155] font-semibold'
              }`}>{row.label}</span>
              {row.sub && <span className="text-[9px] text-[#cbd5e1] ml-1.5">{row.sub}</span>}
            </div>
            <span className={`tabular-nums shrink-0 text-xs ${
              row.isGrand  ? 'font-black text-[#0f172a] text-[13px]' :
              row.isTotal  ? 'font-bold text-[#1e293b]' :
              row.indent   ? 'font-semibold text-[#64748b]' :
              row.amount < 0 ? 'font-bold text-neg' : 'font-bold text-[#334155]'
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
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1.5" />
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-neg-text">
              Negatif Özsermaye — Teknik İflas Riski
            </div>
            <div className="text-xs text-neg-text mt-0.5">
              Özsermaye <strong>{fmt(equity)}</strong>. Toplam yükümlülükler varlıkları aşıyor.
              Sermaye artırımı veya borç yeniden yapılandırması değerlendirilmeli.
            </div>
          </div>
          <Link href="/dashboard/partners" className="text-[10px] font-bold text-neg-text hover:text-neg-text underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap">
            Ortak Sermayesi →
          </Link>
        </div>
      )}

      {/* High leverage warning */}
      {!negativeEquity && leverageRatio > 0.65 && totalLiabilities > 0 && (
        <div className={`rounded border px-4 py-3 flex items-start gap-3 ${
          leverageRatio > 0.80 ? 'bg-neg-light border-neg-light' : 'bg-warn-light border-warn-light'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0 mt-1.5" />
          <div className="flex-1">
            <div className={`text-[11px] font-black uppercase tracking-wide ${leverageRatio > 0.80 ? 'text-neg-text' : 'text-warn-text'}`}>
              {leverageRatio > 0.80 ? 'Yüksek Finansal Kaldıraç' : 'Kaldıraç Oranı Dikkat Sınırında'}
            </div>
            <div className={`text-xs mt-0.5 ${leverageRatio > 0.80 ? 'text-neg-text' : 'text-warn-text'}`}>
              Toplam borç/varlık oranı <strong>%{(leverageRatio * 100).toFixed(0)}</strong>.
              Yabancı kaynaklar: {fmt(totalLiabilities)} · Özsermaye: {fmt(equity)}.
              {leverageRatio > 0.80 ? ' Kredi kapasitesi sınırlı.' : ' Borç yönetimine dikkat.'}
            </div>
          </div>
        </div>
      )}

      {/* Low current ratio warning */}
      {currentRatio !== null && currentRatio < 1.0 && currentLiab > 10_000 && (
        <div className="bg-warn-light border border-warn/30 rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0 mt-1.5" />
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-warn-text">
              Düşük Likidite — Cari Oran {currentRatio.toFixed(2)}
            </div>
            <div className="text-xs text-warn-text mt-0.5">
              Dönen varlıklar ({fmt(currentAssets)}) kısa vadeli borçları ({fmt(currentLiab)}) karşılamıyor.
              Nakit: {fmt(cash)} · Alacaklar: {fmt(bs.assets.receivables_try)}.
            </div>
          </div>
          <Link href="/dashboard/finance?tab=cashflow" className="text-[10px] font-bold text-warn-text hover:text-warn-text underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap">
            Nakit Akışı →
          </Link>
        </div>
      )}

      {/* Header KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Toplam Varlıklar',     value: fmt(bs.assets.total_assets_try),      color: 'text-[#0f172a]' },
          { label: 'Yabancı Kaynaklar',    value: fmt(bs.liabilities.total_liabilities_try), color: bs.liabilities.total_liabilities_try > 0 ? 'text-warn-text' : 'text-[#94a3b8]' },
          { label: 'Özsermaye',            value: fmt(bs.equity.total_equity_try),       color: bs.equity.total_equity_try >= 0 ? 'text-pos-text' : 'text-neg' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
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
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded text-xs font-semibold ${
        bs.balanced
          ? 'bg-pos-light border border-pos-light text-pos-text'
          : 'bg-warn-light border border-warn-light text-warn-text'
      }`}>
        {bs.balanced ? (
          <>✓ Bilanço dengeli — Varlıklar = Kaynaklar ({fmtFull(bs.assets.total_assets_try)})</>
        ) : (
          <>⚠ Bilanço farkı: {fmtFull(diff)} — Bazı kalemler sisteme girilmemiş olabilir (duran varlıklar, tahakkuklar).</>
        )}
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Bilanço tarihi: {bs.as_of_date} · Duran varlıklar ve uzun vadeli tahakkuklar henüz izlenmemektedir.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/partners" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Ortak Özkaynakları →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=cashflow" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Nakit →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/reports/balance-sheet" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Bilanço Raporu →
          </Link>
        </div>
      </div>
    </div>
  )
}
