// ── /documents/balance-sheet/[period] ─────────────────────────────────────────
//
// Addressable, print-optimised Balance Sheet document.
// URL format: /documents/balance-sheet/2026-04 (YYYY-MM)
//
// Sprint 5 "Document Philosophy" — documents are first-class, permanent,
// addressable citizens of the system.
//
// Server component. Action bar is a client island (DocActionBar).

import { notFound }            from 'next/navigation'
import { createClient }        from '@/lib/supabase-server'
import { resolveCompanyId }    from '@/lib/resolve-company'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { fmtTRY }              from '@/lib/format'
import type { BalanceSheet }   from '@/types/dto'
import { DocActionBar }        from '../../_shared/DocActionBar'

export const dynamic = 'force-dynamic'

// ── Formatters ────────────────────────────────────────────────────────────────

const INT_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmtAmt(n: number): string {
  if (n === 0) return '—'
  return (n < 0 ? '−' : '') + '₺' + INT_FMT.format(Math.abs(n))
}

function fmtPctShare(amount: number, total: number): string {
  if (total === 0 || amount === 0) return ''
  const pct = (Math.abs(amount) / Math.abs(total)) * 100
  if (pct < 0.1) return ''
  return `%${pct.toFixed(1)}`
}

function periodLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  const mIdx = parseInt(m, 10) - 1
  return `${months[mIdx] ?? m} ${y}`
}

// ── Row components ────────────────────────────────────────────────────────────

function DocSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={3} style={{
        padding: '10px 0 4px', fontSize: 10, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: '#334155', borderBottom: '1px solid #cbd5e1',
      }}>
        {children}
      </td>
    </tr>
  )
}

interface LineRowProps {
  label:   string
  amount:  number
  total:   number
  indent?: boolean
  bold?:   boolean
  grand?:  boolean
  zero?:   boolean
}

function LineRow({ label, amount, total, indent, bold, grand, zero }: LineRowProps) {
  const display = (zero && amount === 0) ? '—' : fmtAmt(amount)
  const pct     = indent ? fmtPctShare(amount, total) : ''
  return (
    <tr style={{ borderBottom: grand ? '2px solid #334155' : '1px solid #f1f5f9' }}>
      <td style={{
        padding: '5px 0',
        paddingLeft: indent ? 28 : 12,
        fontSize: grand ? 11 : 10,
        fontWeight: grand ? 900 : bold ? 700 : 500,
        color: grand ? '#0f172a' : bold ? '#334155' : '#475569',
      }}>
        {label}
      </td>
      <td style={{ padding: '5px 8px', fontSize: 9, color: '#94a3b8', textAlign: 'right' }}>
        {pct}
      </td>
      <td style={{
        padding: '5px 0 5px 8px', textAlign: 'right',
        fontSize: grand ? 12 : 10,
        fontWeight: grand ? 900 : bold ? 700 : 500,
        color: amount < 0 ? '#dc2626' : grand ? '#0f172a' : '#1e293b',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {display}
      </td>
    </tr>
  )
}

// ── Section builders ──────────────────────────────────────────────────────────

function AssetSection({ bs }: { bs: BalanceSheet }) {
  const a   = bs.assets
  const tot = a.total_assets_try
  return (
    <>
      <DocSectionHeader>Dönen Varlıklar</DocSectionHeader>
      <LineRow label="Kasa ve Bankalar" amount={a.cash_try}          total={tot} indent zero />
      <LineRow label="Ticari Alacaklar"  amount={a.receivables_try}  total={tot} indent zero />
      <LineRow label="Stok (FIFO)"        amount={a.inventory_try}    total={tot} indent zero />
      {a.other_current_try > 0 &&
        <LineRow label="Diğer Dönen Varlıklar" amount={a.other_current_try} total={tot} indent />}
      <LineRow label="Toplam Dönen Varlıklar" amount={a.total_current_try} total={tot} bold />

      {a.total_non_current_try > 0 && <>
        <DocSectionHeader>Duran Varlıklar</DocSectionHeader>
        {a.equipment_try > 0 &&
          <LineRow label="Maddi Duran Varlıklar" amount={a.equipment_try}         total={tot} indent />}
        {a.deposits_try > 0 &&
          <LineRow label="Depozitolar"            amount={a.deposits_try}          total={tot} indent />}
        {a.other_non_current_try > 0 &&
          <LineRow label="Diğer Duran"            amount={a.other_non_current_try} total={tot} indent />}
        <LineRow label="Toplam Duran Varlıklar" amount={a.total_non_current_try} total={tot} bold />
      </>}

      <LineRow label="TOPLAM VARLIKLAR" amount={a.total_assets_try} total={tot} grand />
    </>
  )
}

function LiabEquitySection({ bs }: { bs: BalanceSheet }) {
  const l   = bs.liabilities
  const e   = bs.equity
  const tot = bs.assets.total_assets_try
  return (
    <>
      <DocSectionHeader>Kısa Vadeli Yükümlülükler</DocSectionHeader>
      {l.partner_loans_try > 0 &&
        <LineRow label="Ortaklara Borçlar (K.V.)"  amount={l.partner_loans_try}          total={tot} indent />}
      {l.tax_payable_try > 0 &&
        <LineRow label="Vergi Yükümlülükleri"       amount={l.tax_payable_try}            total={tot} indent />}
      {l.other_current_payables_try > 0 &&
        <LineRow label="Diğer Kısa Vadeli Borçlar" amount={l.other_current_payables_try} total={tot} indent />}
      {l.total_current_try === 0 &&
        <LineRow label="Kısa Vadeli Borç Yok" amount={0} total={0} indent zero />}
      <LineRow label="Toplam Kısa Vadeli" amount={l.total_current_try} total={tot} bold />

      {l.total_non_current_try > 0 && <>
        <DocSectionHeader>Uzun Vadeli Yükümlülükler</DocSectionHeader>
        {l.partner_loans_long_term_try > 0 &&
          <LineRow label="Ortaklara Borçlar (U.V.)" amount={l.partner_loans_long_term_try} total={tot} indent />}
        {l.other_non_current_try > 0 &&
          <LineRow label="Diğer Uzun Vadeli"         amount={l.other_non_current_try}       total={tot} indent />}
        <LineRow label="Toplam Uzun Vadeli" amount={l.total_non_current_try} total={tot} bold />
      </>}

      <LineRow label="Toplam Yabancı Kaynaklar" amount={l.total_liabilities_try} total={tot} bold />

      <DocSectionHeader>Özsermaye</DocSectionHeader>
      {e.partner_capital_lines.length <= 4 && e.partner_capital_lines.map(p => (
        <LineRow
          key={p.partner_id}
          label={`${p.partner_name} (%${(p.share_ratio * 100).toFixed(0)})`}
          amount={p.capital_try} total={tot} indent zero
        />
      ))}
      {e.partner_capital_lines.length > 4 &&
        <LineRow label="Ortak Sermayeleri (toplam)" amount={e.total_partner_capital_try} total={tot} indent />}
      {e.retained_earnings_try !== 0 &&
        <LineRow label="Geçmiş Yıl Kârları" amount={e.retained_earnings_try} total={tot} indent />}
      <LineRow label="Dönem Net Kârı/Zararı" amount={e.current_period_profit_try} total={tot} indent zero />
      <LineRow label="Toplam Özsermaye" amount={e.total_equity_try} total={tot} bold />

      <LineRow
        label="TOPLAM KAYNAKLAR"
        amount={l.total_liabilities_try + e.total_equity_try}
        total={tot} grand
      />
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface PageParams { period: string }

export default async function BalanceSheetDocPage({ params }: { params: Promise<PageParams> }) {
  const { period } = await params

  if (!/^\d{4}-\d{2}$/.test(period)) notFound()

  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) notFound()

  const userId = userData.user.id
  let companyId: string
  try { companyId = await resolveCompanyId(userId, supabase) }
  catch { notFound() }

  const { data: co } = await supabase.from('companies').select('name').eq('id', companyId).single()
  const companyName  = co?.name ?? 'Şirket'

  const [year, month] = period.split('-')
  const lastDay  = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()
  const asOfDate = `${period}-${String(lastDay).padStart(2, '0')}`

  let bs: BalanceSheet | null = null
  try { bs = await BalanceSheetService.compute(userId, companyId, asOfDate, supabase) }
  catch { /* render error below */ }

  if (!bs) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>
        <p>Bilanço verisi yüklenemedi. Lütfen daha sonra tekrar deneyin.</p>
      </div>
    )
  }

  const generatedAt = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .doc-watermark { opacity: 0.04 !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}} />

      <DocActionBar backHref="/dashboard/finance?tab=balance" backLabel="Finans Merkezi" />

      <div style={{
        maxWidth: 820, margin: '0 auto', padding: '40px 32px',
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        position: 'relative', minHeight: '100vh',
      }}>

        {/* Watermark */}
        <div className="doc-watermark" style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%) rotate(-35deg)',
          fontSize: 72, fontWeight: 900, color: '#0f172a', opacity: 0.035,
          pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          letterSpacing: '0.1em',
        }}>
          FLOWRA FINANCIAL
        </div>

        {/* Header */}
        <div style={{ borderBottom: '3px solid #0f172a', paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: '#64748b', marginBottom: 4 }}>
                FİNANSAL DÖKÜMAN · BİLANÇO
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a',
                letterSpacing: '-0.02em' }}>
                {companyName}
              </h1>
              <div style={{ fontSize: 14, color: '#334155', marginTop: 4, fontWeight: 600 }}>
                {periodLabel(period)} Dönemi Bilançosu
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Bilanço Tarihi</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{asOfDate}</div>
              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 8, marginBottom: 2 }}>Oluşturulma</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{generatedAt}</div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Flowra Financial Documents
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Invariant banner */}
        <div style={{
          padding: '8px 14px', borderRadius: 6, marginBottom: 20,
          fontSize: 10, fontWeight: 700,
          background: bs.balanced ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${bs.balanced ? '#86efac' : '#fca5a5'}`,
          color: bs.balanced ? '#166534' : '#991b1b',
        }}>
          {bs.balanced
            ? `✓ Bilanço dengeli — Aktifler = Pasifler + Özkaynaklar (${fmtTRY(bs.assets.total_assets_try)})`
            : `⚠ Bilanço dengeli değil — Fark: ${fmtTRY(Math.abs(bs.imbalance_try))} — CFO onayı gerekli`}
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: '#64748b', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between' }}>
              <span>Varlıklar</span>
              <span style={{ color: '#94a3b8' }}>Pay · Tutar</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody><AssetSection bs={bs} /></tbody>
            </table>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: '#64748b', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between' }}>
              <span>Kaynaklar</span>
              <span style={{ color: '#94a3b8' }}>Pay · Tutar</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody><LiabEquitySection bs={bs} /></tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 48, paddingTop: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>Denetçi Notu</div>
            <div style={{ fontSize: 9, color: '#cbd5e1', fontStyle: 'italic' }}>
              Bu bilanço Flowra sistemi tarafından otomatik hesaplanmıştır.
              Bağımsız denetim için yetkili Mali Müşavir onayı alınmalıdır.
            </div>
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'right' }}>
            <div>Sayfa 1 / 1</div>
            <div style={{ marginTop: 4 }}>flowra.app</div>
          </div>
        </div>

      </div>
    </>
  )
}
