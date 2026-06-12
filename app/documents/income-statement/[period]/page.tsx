// ── /documents/income-statement/[period] ──────────────────────────────────────
//
// Addressable, print-optimised Income Statement document.
// URL format: /documents/income-statement/2026-04 (YYYY-MM)
//
// Sprint 5 "Document Philosophy" — documents as first-class citizens.
//
// Server component. DocActionBar is a client island for print/copy handlers.

import { notFound }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { FinanceService }   from '@/lib/services/finance.service'
import { fmtTRY }           from '@/lib/format'
import type { FinancialSummary } from '@/types'
import { DocActionBar }     from '../../_shared/DocActionBar'

export const dynamic = 'force-dynamic'

// ── Formatters ────────────────────────────────────────────────────────────────

const INT_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmtAmt(n: number): string {
  if (n === 0) return '—'
  return (n < 0 ? '−' : '') + '₺' + INT_FMT.format(Math.abs(n))
}

function fmtMargin(pct: number): string {
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

function ISHeader({ children }: { children: React.ReactNode }) {
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

interface ISRowProps {
  label:   string
  amount:  number
  margin?: number   // margin % (0-100) to show in middle column
  indent?: boolean
  bold?:   boolean
  grand?:  boolean
  neg?:    boolean  // force display as outflow/cost (red)
}

function ISRow({ label, amount, margin, indent, bold, grand, neg }: ISRowProps) {
  const display = fmtAmt(amount)
  const isRed   = neg || (amount < 0)
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
        {margin !== undefined ? fmtMargin(margin) : ''}
      </td>
      <td style={{
        padding: '5px 0 5px 8px', textAlign: 'right',
        fontSize: grand ? 12 : 10,
        fontWeight: grand ? 900 : bold ? 700 : 500,
        color: isRed ? '#dc2626' : grand ? '#0f172a' : '#1e293b',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {display}
      </td>
    </tr>
  )
}

// ── Income Statement Section ──────────────────────────────────────────────────

function IncomeStatementBody({ fs }: { fs: FinancialSummary }) {
  const grossMarginPct = fs.revenue_try > 0
    ? (fs.gross_profit_try / fs.revenue_try) * 100 : 0
  const ebitda         = fs.gross_profit_try - fs.expenses_total_try
  const ebitdaMarginPct = fs.revenue_try > 0 ? (ebitda / fs.revenue_try) * 100 : 0
  const netMarginPct   = fs.revenue_try > 0
    ? (fs.net_after_tax_try / fs.revenue_try) * 100 : 0

  return (
    <>
      <ISHeader>Gelirler</ISHeader>
      <ISRow label="Brüt Satış (KDV dâhil)"    amount={fs.revenue_try} bold />
      <ISRow label="Satışların Maliyeti (SMM)"
        amount={-fs.cost_try} indent neg />

      <ISHeader>Brüt Kâr</ISHeader>
      <ISRow label="Brüt Kâr" amount={fs.gross_profit_try}
        bold margin={grossMarginPct} />

      <ISHeader>Faaliyet Giderleri</ISHeader>
      <ISRow label="Toplam Faaliyet Giderleri"
        amount={-fs.expenses_total_try} indent neg />
      <ISRow label="— İndirilemeyen Giderler"
        amount={-fs.non_deductible_expenses_try} indent neg />

      <ISHeader>Faaliyet Kârı (FAVÖK)</ISHeader>
      <ISRow label="FAVÖK" amount={ebitda}
        bold margin={ebitdaMarginPct} />

      <ISHeader>Vergi Öncesi Kâr</ISHeader>
      <ISRow label="Vergi Matrahı (Kurumlar)" amount={fs.matrah_try} indent />
      <ISRow label={`Kurumlar Vergisi (%${(fs.corporate_tax_rate * 100).toFixed(0)})`}
        amount={-fs.corporate_tax_try} indent neg />

      <ISHeader>Net Kâr</ISHeader>
      <ISRow label="VERGİ SONRASI NET KÂR" amount={fs.net_after_tax_try}
        grand margin={netMarginPct} />

      <tr><td colSpan={3} style={{ height: 16 }} /></tr>
      <ISHeader>KDV Özeti</ISHeader>
      <ISRow label="Satış KDV"    amount={fs.sales_vat_try}    indent />
      <ISRow label="Alış KDV"     amount={-fs.purchase_vat_try} indent neg />
      <ISRow label="Gider KDV"    amount={-fs.expense_vat_try}  indent neg />
      <ISRow label="Net KDV (Tahakkuk)" amount={fs.net_vat_try} bold />
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface PageParams { period: string }

export async function generateMetadata({ params }: { params: Promise<PageParams> }) {
  const { period } = await params
  const label = /^\d{4}-\d{2}$/.test(period) ? periodLabel(period) : period
  return { title: `Gelir Tablosu — ${label}`, robots: { index: false, follow: false } }
}

export default async function IncomeStatementDocPage({ params }: { params: Promise<PageParams> }) {
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

  // Period: from first day to last day of the month
  const [year, month] = period.split('-')
  const lastDay  = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()
  const from     = `${period}-01`
  const to       = `${period}-${String(lastDay).padStart(2, '0')}`

  let fs: FinancialSummary | null = null
  try {
    fs = await FinanceService.getFinancialSummary(userId, companyId, { from, to }, undefined, undefined, supabase)
  } catch { /* render error below */ }

  if (!fs) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', color: '#64748b' }}>
        <p>Gelir tablosu verisi yüklenemedi. Lütfen daha sonra tekrar deneyin.</p>
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

      <DocActionBar backHref="/dashboard/finance?tab=pnl" backLabel="Finans Merkezi" />

      <div style={{
        maxWidth: 640, margin: '0 auto', padding: '40px 32px',
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
                FİNANSAL DÖKÜMAN · GELİR TABLOSU
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a',
                letterSpacing: '-0.02em' }}>
                {companyName}
              </h1>
              <div style={{ fontSize: 14, color: '#334155', marginTop: 4, fontWeight: 600 }}>
                {periodLabel(period)} Dönemi Gelir Tablosu
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Dönem</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{from} / {to}</div>
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

        {/* Summary KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Brüt Satış (KDV dâhil)', value: fmtTRY(fs.revenue_try) },
            { label: 'Brüt Kâr',          value: fmtTRY(fs.gross_profit_try) },
            { label: 'FAVÖK',             value: fmtTRY(fs.gross_profit_try - fs.expenses_total_try) },
            { label: 'Net Kâr (Sonrası)', value: fmtTRY(fs.net_after_tax_try) },
          ].map(k => (
            <div key={k.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>
                {k.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a',
                fontVariantNumeric: 'tabular-nums' }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Statement table */}
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: '#64748b', marginBottom: 8,
          display: 'flex', justifyContent: 'space-between' }}>
          <span>Kalem</span>
          <span style={{ color: '#94a3b8' }}>Marj · Tutar</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <IncomeStatementBody fs={fs} />
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 48, paddingTop: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>Denetçi Notu</div>
            <div style={{ fontSize: 9, color: '#cbd5e1', fontStyle: 'italic' }}>
              Bu gelir tablosu Flowra sistemi tarafından otomatik hesaplanmıştır.
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
