// ── BalanceTab — Bilanço (Balance Sheet) ─────────────────────────────────────
//
// Authoritative balance sheet via BalanceSheetService.compute().
// Includes FIFO inventory, per-partner capital lines, partner loans,
// estimated tax payable, current-period P&L, and balanced invariant check.
// Two-column layout: Varlıklar (Assets) | Kaynaklar (Liabilities + Equity)
// Sprint 5: narrative-institutional format — account | amount | % of total | document links

import Link                          from 'next/link'
import { createClient }             from '@/lib/supabase-server'
import { BalanceSheetService }      from '@/lib/services/balance-sheet.service'
import { GLBalanceSheetService }    from '@/lib/services/ledger/gl-balance-sheet.service'
import { fmtTRY as fmt }            from '@/lib/format'
import type { BalanceSheet }        from '@/types/dto'
import { NarrativeFooter }          from '@/components/ds'
import { WorkingCapitalSection }    from '@/components/dashboard/WorkingCapitalSection'
import { RetainedEarningsClient }   from './_retained/RetainedEarningsClient'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtFull(n: number): string { return fmt(n, 0) }
function fmtPct(pct: number): string {
  if (!isFinite(pct)) return '—'
  return `%${Math.abs(pct).toFixed(1)}`
}

// ── Row types ─────────────────────────────────────────────────────────────────

type Row = {
  label:    string
  amount:   number
  pctOf?:   number        // total to compute % share from
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
      <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">{title}</span>
        <span className="text-[0.6rem] text-[#94a3b8] font-medium">Tutar · Pay</span>
      </div>
      <div className="flex-1 divide-y divide-[#f1f5f9] px-4 py-2">
        {rows.map((row, i) => {
          const pct = (row.pctOf && row.pctOf > 0) ? (row.amount / row.pctOf) * 100 : null
          return (
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
              <div className="flex items-center gap-3 shrink-0">
                {/* % share of total */}
                {pct !== null && !row.isGrand && !row.isTotal && (
                  <span className="text-[0.6rem] text-[#94a3b8] tabular-nums w-10 text-right">
                    {fmtPct(pct)}
                  </span>
                )}
                <span className={`tabular-nums text-xs ${
                  row.isGrand  ? 'font-black text-[#0f172a] text-[13px]' :
                  row.isTotal  ? 'font-bold text-[#1e293b]' :
                  row.indent   ? 'font-semibold text-[#64748b]' :
                  row.amount < 0 ? 'font-bold text-neg' : 'font-bold text-[#334155]'
                }`}>
                  {(row.zero && row.amount === 0) ? '—' : fmtFull(row.amount)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Row builders ──────────────────────────────────────────────────────────────

function buildAssetRows(bs: BalanceSheet): Row[] {
  const a   = bs.assets
  const tot = a.total_assets_try
  const rows: Row[] = [
    { label: 'Dönen Varlıklar', amount: a.total_current_try, isTotal: true, pctOf: tot },
    { label: 'Kasa ve Bankalar',  amount: a.cash_try,         indent: true, zero: true, pctOf: tot },
    { label: 'Ticari Alacaklar',  amount: a.receivables_try,  indent: true, zero: true, pctOf: tot },
    { label: 'Stok (FIFO)',        amount: a.inventory_try,    indent: true, zero: true, pctOf: tot },
  ]
  if (a.other_current_try > 0) {
    rows.push({ label: 'Diğer Dönen Varlıklar', amount: a.other_current_try, indent: true, pctOf: tot })
  }
  // Non-current assets (usually 0 until equipment tracking)
  if (a.total_non_current_try > 0) {
    rows.push({ label: 'Duran Varlıklar', amount: a.total_non_current_try, isTotal: true, pctOf: tot })
    if (a.equipment_try > 0)         rows.push({ label: 'Maddi Duran Varlıklar', amount: a.equipment_try,  indent: true, pctOf: tot })
    if (a.deposits_try > 0)          rows.push({ label: 'Depozitolar',           amount: a.deposits_try,   indent: true, pctOf: tot })
    if (a.other_non_current_try > 0) rows.push({ label: 'Diğer Duran',           amount: a.other_non_current_try, indent: true, pctOf: tot })
  }
  rows.push({ label: 'TOPLAM VARLIKLAR', amount: tot, isGrand: true })
  return rows
}

function buildLiabEquityRows(bs: BalanceSheet): Row[] {
  const l   = bs.liabilities
  const e   = bs.equity
  const tot = bs.assets.total_assets_try   // use asset total as denominator for % share
  const rows: Row[] = []

  // ── Liabilities ──────────────────────────────────────────────────────────────
  rows.push({ label: 'Kısa Vadeli Yükümlülükler', amount: l.total_current_try, isTotal: true, pctOf: tot })
  if (l.partner_loans_try > 0)
    rows.push({ label: 'Ortaklara Borçlar (K.V.)',   amount: l.partner_loans_try,           indent: true, pctOf: tot })
  if (l.tax_payable_try > 0)
    rows.push({ label: 'Vergi Yükümlülükleri',        amount: l.tax_payable_try,             indent: true, pctOf: tot })
  if (l.other_current_payables_try > 0)
    rows.push({ label: 'Diğer Kısa Vadeli Borçlar',  amount: l.other_current_payables_try,  indent: true, pctOf: tot })
  if (l.total_current_try === 0)
    rows.push({ label: 'Kısa Vadeli Borç Yok',       amount: 0, indent: true, zero: true })

  if (l.total_non_current_try > 0) {
    rows.push({ label: 'Uzun Vadeli Yükümlülükler', amount: l.total_non_current_try, isTotal: true, pctOf: tot })
    if (l.partner_loans_long_term_try > 0)
      rows.push({ label: 'Ortaklara Borçlar (U.V.)', amount: l.partner_loans_long_term_try, indent: true, pctOf: tot })
    if (l.other_non_current_try > 0)
      rows.push({ label: 'Diğer Uzun Vadeli',        amount: l.other_non_current_try,       indent: true, pctOf: tot })
  }

  rows.push({ label: 'Toplam Yabancı Kaynaklar', amount: l.total_liabilities_try, isTotal: true, pctOf: tot })

  // ── Equity ───────────────────────────────────────────────────────────────────
  rows.push({ label: 'Özsermaye', amount: e.total_equity_try, isTotal: true, pctOf: tot })

  // Per-partner capital lines (show up to 4 individually, else just total)
  if (e.partner_capital_lines.length > 0 && e.partner_capital_lines.length <= 4) {
    for (const p of e.partner_capital_lines) {
      rows.push({
        label:  p.partner_name,
        amount: p.capital_try,
        indent: true,
        sub:    `%${(p.share_ratio * 100).toFixed(0)}`,
        zero:   true,
        pctOf:  tot,
      })
    }
  } else if (e.partner_capital_lines.length > 4) {
    rows.push({ label: 'Ortak Sermayeleri', amount: e.total_partner_capital_try, indent: true, pctOf: tot })
  }

  if (e.retained_earnings_try !== 0)
    rows.push({ label: 'Geçmiş Yıl Kârları', amount: e.retained_earnings_try, indent: true, pctOf: tot })
  rows.push({ label: 'Dönem Net Kârı/Zararı', amount: e.current_period_profit_try, indent: true, zero: true, pctOf: tot })

  rows.push({ label: 'TOPLAM KAYNAKLAR', amount: l.total_liabilities_try + e.total_equity_try, isGrand: true })
  return rows
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string; glMode?: string }

export async function BalanceTab({ userId, companyId, glMode = 'shadow' }: Props) {
  const today   = new Date().toISOString().slice(0, 10)
  const supabase = createClient()

  const FALLBACK: BalanceSheet = {
    as_of_date: today, computed_at: today,
    assets:      { cash_try: 0, receivables_try: 0, inventory_try: 0, other_current_try: 0, total_current_try: 0, equipment_try: 0, deposits_try: 0, other_non_current_try: 0, total_non_current_try: 0, total_assets_try: 0 },
    liabilities: { partner_loans_try: 0, tax_payable_try: 0, other_current_payables_try: 0, total_current_try: 0, partner_loans_long_term_try: 0, other_non_current_try: 0, total_non_current_try: 0, total_liabilities_try: 0 },
    equity:      { partner_capital_lines: [], total_partner_capital_try: 0, retained_earnings_try: 0, current_period_profit_try: 0, total_equity_try: 0 },
    balanced: true, imbalance_try: 0,
  }

  // Try GL balance sheet when mode supports it
  const canUseGl = glMode === 'gl_primary' || glMode === 'parallel'
  const glBs = canUseGl
    ? await GLBalanceSheetService.compute(companyId, supabase, { asOf: today }).catch(() => null)
    : null

  // Use GL data if gl_primary with real entries (total_assets > 0), else fall back to operational
  const hasGlEntries = glBs !== null && glBs.total_assets_try > 0
  const useGlData    = glMode === 'gl_primary' && hasGlEntries
  const balanceSource = useGlData ? 'GL Tabanlı' : 'Operasyonel Tahmin'

  // Operational balance sheet (always computed as fallback)
  const operationalBs = await BalanceSheetService.compute(userId, companyId, today, supabase).catch(() => FALLBACK)

  // Build unified balance sheet for rendering from GL data when available
  const glMappedBs: BalanceSheet | null = (useGlData && glBs) ? {
    as_of_date:  today,
    computed_at: glBs.computed_at,
    assets: {
      cash_try:             glBs.cash_try,
      receivables_try:      glBs.trade_receivables_try,
      inventory_try:        glBs.inventory_try,
      other_current_try:    glBs.deductible_vat_try,
      total_current_try:    glBs.cash_try + glBs.trade_receivables_try + glBs.inventory_try + glBs.deductible_vat_try,
      equipment_try:        Math.max(0, glBs.equipment_net_try),
      deposits_try:         0,
      other_non_current_try: 0,
      total_non_current_try: Math.max(0, glBs.equipment_net_try),
      total_assets_try:     glBs.total_assets_try,
    },
    liabilities: {
      partner_loans_try:          glBs.partner_loans_st_try,
      tax_payable_try:            glBs.tax_payable_try + glBs.output_vat_try,
      other_current_payables_try: glBs.trade_payables_try + glBs.payroll_payables_try,
      total_current_try:          glBs.trade_payables_try + glBs.partner_loans_st_try + glBs.payroll_payables_try + glBs.tax_payable_try + glBs.output_vat_try,
      partner_loans_long_term_try: glBs.partner_loans_lt_try,
      other_non_current_try:      0,
      total_non_current_try:      glBs.partner_loans_lt_try,
      total_liabilities_try:      glBs.total_liabilities_try,
    },
    equity: {
      partner_capital_lines:       [],
      total_partner_capital_try:   glBs.paid_in_capital_try,
      retained_earnings_try:       glBs.retained_earnings_try - glBs.accumulated_losses_try,
      current_period_profit_try:   glBs.current_period_profit_try,
      total_equity_try:            glBs.total_equity_try,
    },
    balanced:      glBs.is_balanced,
    imbalance_try: glBs.imbalance_try,
  } : null

  const bs = glMappedBs ?? operationalBs

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

      {/* Balance source indicator */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Bilanço Kaynağı:</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black ${
          useGlData
            ? 'bg-pos-light border-pos-light text-pos-text'
            : 'bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]'
        }`}>
          {balanceSource}
        </span>
        {glMode === 'parallel' && !hasGlEntries && (
          <span className="text-[9px] text-[#94a3b8]">Paralel modda GL kayıtları henüz yok</span>
        )}
      </div>

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

      {/* Balanced invariant check — Denklik */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded text-xs font-semibold ${
        bs.balanced
          ? 'bg-pos-light border border-pos-light text-pos-text'
          : 'bg-warn-light border border-warn-light text-warn-text'
      }`}>
        {bs.balanced ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
            Denklik: Dengeli — Varlıklar = Kaynaklar ({fmtFull(bs.assets.total_assets_try)})
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" />
            Denklik: Dengesiz — ₺{fmtFull(diff)} fark — Bazı kalemler sisteme girilmemiş olabilir.
          </>
        )}
      </div>

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative={`Bilanço tarihi: ${bs.as_of_date} · Duran varlıklar ve uzun vadeli tahakkuklar henüz izlenmemektedir.`}
        links={[
          { label: 'Ortak Özkaynakları', href: '/dashboard/partners' },
          { label: 'Nakit',              href: '/dashboard/finance?tab=cashflow' },
          { label: 'Bilanço Belgesi',    href: `/documents/balance-sheet/${bs.as_of_date.slice(0,7)}` },
          { label: 'Yönetim Paketi',     href: `/documents/income-statement/${bs.as_of_date.slice(0,7)}` },
        ]}
      />

      {/* Working Capital Analysis — CCC, liquidity ratios, 12-month trend */}
      <WorkingCapitalSection />

      {/* Retained Earnings Rollforward — equity movement period by period */}
      <RetainedEarningsClient companyId={companyId} />
    </div>
  )
}
