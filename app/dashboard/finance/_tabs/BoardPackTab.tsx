'use client'
// ── BoardPackTab — Yönetim Paketi (Board Package Assembly) ───────────────────
//
// Sprint 5 "Document Philosophy" — one-action board package assembly.
//
// The user selects a period, clicks "Paket Oluştur", and the system assembles
// all financial statements, ratios, alerts, and document links into a single
// structured package. Preview cards are shown for each section.
//
// Client component: needs useState for async assembly flow.

import { useState }  from 'react'
import Link          from 'next/link'
import { fmtTRY }   from '@/lib/format'
import {
  CFO_PACK_MANIFEST,
  type CFOPackReport,
} from '@/lib/reports/cfo-pack-manifest'

// ── Types ──────────────────────────────────────────────────────────────────────

interface KeyRatios {
  current_ratio:    number | null
  dsr:              number
  gross_margin_pct: number | null
  net_margin_pct:   number | null
  leverage_ratio:   number | null
}

interface ExecSummary {
  status:          string
  composite_score: number
  situation_line:  string
  critical_factor: string
}

interface BalanceSheetData {
  total_assets:      number
  total_liabilities: number
  total_equity:      number
  cash:              number
  balanced:          boolean
  imbalance_try:     number
}

interface CashFlowData {
  operating:       number
  investing:       number
  financing:       number
  net_change:      number
  closing_balance: number
}

interface PnlData {
  revenue:      number
  gross_profit: number
  ebitda:       number
  net_income:   number
  net_vat:      number
}

interface DecisionAlert {
  id:       string
  severity: 'info' | 'warning' | 'critical'
  title:    string
  detail?:  string
}

interface PartnerRow {
  partner_id:   string
  partner_name: string
  share_ratio:  number
  equity_try:   number
  net_loan_try: number
}

interface DocumentLinks {
  balance_sheet:    string
  income_statement: string
}

interface Completeness {
  total:              number
  required_total:     number
  available:          number
  required_available: number
  pct_complete:       number
}

interface BoardPack {
  period:       string
  generated_at: string
  company_name: string
  completeness?: Completeness
  data: {
    executive_summary: ExecSummary
    balance_sheet:     BalanceSheetData | null
    cash_flow:         CashFlowData | null
    period_pnl:        PnlData | null
    key_ratios:        KeyRatios
    decision_alerts:   DecisionAlert[]
    partner_summary:   PartnerRow[]
    document_links:    DocumentLinks
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'healthy':  return '#166534'
    case 'caution':  return '#92400e'
    case 'at-risk':  return '#9a3412'
    case 'critical': return '#991b1b'
    default:         return '#334155'
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'healthy':  return '#f0fdf4'
    case 'caution':  return '#fffbeb'
    case 'at-risk':  return '#fff7ed'
    case 'critical': return '#fef2f2'
    default:         return '#f8fafc'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'healthy':  return 'Sağlıklı'
    case 'caution':  return 'Dikkatli'
    case 'at-risk':  return 'Risk Altında'
    case 'critical': return 'Kritik'
    default:         return status
  }
}

function alertBg(severity: string): string {
  switch (severity) {
    case 'critical': return '#fef2f2'
    case 'warning':  return '#fffbeb'
    default:         return '#f8fafc'
  }
}

function alertColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#991b1b'
    case 'warning':  return '#92400e'
    default:         return '#334155'
  }
}

function alertIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '⚠'
    case 'warning':  return '!'
    default:         return 'i'
  }
}

function fmtRatio(v: number | null, decimals = 2): string {
  if (v === null) return '—'
  return v.toFixed(decimals)
}

function fmtPct(v: number | null): string {
  if (v === null) return '—'
  return `%${v.toFixed(1)}`
}

function categoryLabel(cat: CFOPackReport['category']): string {
  switch (cat) {
    case 'accounting':          return 'Muhasebe'
    case 'financial_statement': return 'Finansal Tablo'
    case 'tax':                 return 'Vergi'
    case 'partner':             return 'Ortak'
    case 'executive':           return 'Yönetim'
    default:                    return cat
  }
}

function categoryColor(cat: CFOPackReport['category']): string {
  switch (cat) {
    case 'accounting':          return 'bg-[#eff6ff] text-[#1d4ed8]'
    case 'financial_statement': return 'bg-[#f0fdf4] text-[#166534]'
    case 'tax':                 return 'bg-[#fffbeb] text-[#92400e]'
    case 'partner':             return 'bg-[#faf5ff] text-[#7e22ce]'
    case 'executive':           return 'bg-[#fff1f2] text-[#9f1239]'
    default:                    return 'bg-[#f8fafc] text-[#64748b]'
  }
}

// ── Preview card sub-components ───────────────────────────────────────────────

function SectionCard({ title, children, docHref }: {
  title:    string
  children: React.ReactNode
  docHref?: string
}) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
          {title}
        </span>
        {docHref && (
          <Link href={docHref} target="_blank"
            className="text-[10px] font-semibold text-brand-light hover:underline whitespace-nowrap">
            Belgeyi Aç →
          </Link>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function KpiRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-xs text-[#64748b]">{label}</span>
      <div className="text-right">
        <span className="text-xs font-bold text-[#0f172a] tabular-nums">{value}</span>
        {sub && <span className="text-[10px] text-[#94a3b8] ml-1.5">{sub}</span>}
      </div>
    </div>
  )
}

// ── Period selector ───────────────────────────────────────────────────────────

function buildPeriodOptions(): string[] {
  const now     = new Date()
  const options: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push(p)
  }
  return options
}

function periodDisplayLabel(p: string): string {
  const [y, m] = p.split('-')
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  const mIdx   = parseInt(m, 10) - 1
  return `${months[mIdx] ?? m} ${y}`
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  userId:    string
  companyId: string
}

type BuildState = 'idle' | 'loading' | 'done' | 'error'

const SECTIONS = [
  'Durum Özeti',
  'Bilanço',
  'Nakit Akışı',
  'Kâr / Zarar',
  'Temel Rasyolar',
  'Karar Uyarıları',
  'Ortak Özeti',
]

export function BoardPackTab({ userId: _userId, companyId: _companyId }: Props) {
  const now          = new Date()
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const periodOptions = buildPeriodOptions()

  const [period,   setPeriod]   = useState<string>(defaultPeriod)
  const [state,    setState]    = useState<BuildState>('idle')
  const [pack,     setPack]     = useState<BoardPack | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [progress, setProgress] = useState<number>(0)

  async function buildPack() {
    setState('loading')
    setPack(null)
    setErrorMsg('')
    setProgress(0)

    // Simulate section-by-section progress while the request is in flight
    const ticker = setInterval(() => {
      setProgress(p => Math.min(p + 1, SECTIONS.length - 1))
    }, 300)

    try {
      const res = await fetch(`/api/reports/board-pack?period=${period}`)
      clearInterval(ticker)

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json() as BoardPack
      setProgress(SECTIONS.length)
      setPack(data)
      setState('done')
    } catch (e) {
      clearInterval(ticker)
      setErrorMsg(e instanceof Error ? e.message : 'Bilinmeyen hata')
      setState('error')
    }
  }

  const d = pack?.data

  return (
    <div className="space-y-5">

      {/* ── Control bar ────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5">
            Dönem
          </div>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            disabled={state === 'loading'}
            className="h-9 px-3 border border-[#e8eaef] rounded text-xs font-semibold text-[#334155] bg-white focus:outline-none focus:ring-1 focus:ring-brand-light disabled:opacity-50"
          >
            {periodOptions.map(p => (
              <option key={p} value={p}>{periodDisplayLabel(p)}</option>
            ))}
          </select>
        </div>

        <button
          onClick={buildPack}
          disabled={state === 'loading'}
          className="h-9 px-5 rounded bg-[#0f172a] text-white text-xs font-black tracking-wide hover:bg-[#1e293b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'loading' ? 'Oluşturuluyor…' : 'Paket Oluştur'}
        </button>

        {state === 'done' && pack && (
          <div className="flex items-center gap-2 ml-auto">
            <Link
              href={d!.document_links.balance_sheet}
              target="_blank"
              className="h-9 px-4 inline-flex items-center rounded border border-[#e8eaef] text-xs font-semibold text-[#334155] hover:bg-[#f8fafc] transition-colors"
            >
              Bilanço Belgesi
            </Link>
            <Link
              href={d!.document_links.income_statement}
              target="_blank"
              className="h-9 px-4 inline-flex items-center rounded border border-[#e8eaef] text-xs font-semibold text-[#334155] hover:bg-[#f8fafc] transition-colors"
            >
              Gelir Tablosu Belgesi
            </Link>
            <button
              onClick={() => window.print()}
              className="h-9 px-4 rounded bg-[#f8fafc] border border-[#e8eaef] text-xs font-semibold text-[#334155] hover:bg-white transition-colors"
            >
              Tümünü Yazdır
            </button>
          </div>
        )}
      </div>

      {/* ── Progress indicator ──────────────────────────────────────────────── */}
      {state === 'loading' && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-5 py-4 space-y-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Paket Hazırlanıyor
          </div>
          <div className="space-y-2">
            {SECTIONS.map((sec, i) => (
              <div key={sec} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                  i < progress
                    ? 'bg-pos'
                    : i === progress
                    ? 'bg-brand-light animate-pulse'
                    : 'bg-[#e2e8f0]'
                }`} />
                <span className={`text-xs ${i <= progress ? 'text-[#334155] font-semibold' : 'text-[#94a3b8]'}`}>
                  {sec}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────────── */}
      {state === 'error' && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 flex items-start gap-3">
          <span className="text-neg font-black">⚠</span>
          <div>
            <div className="text-xs font-black text-neg-text">Paket oluşturulamadı</div>
            <div className="text-xs text-neg-text mt-0.5">{errorMsg}</div>
          </div>
        </div>
      )}

      {/* ── Idle prompt ─────────────────────────────────────────────────────── */}
      {state === 'idle' && (
        <div className="space-y-4">

          {/* Intro card */}
          <div className="bg-[#f8fafc] border border-dashed border-[#e8eaef] rounded px-6 py-8 text-center">
            <div className="text-2xl mb-3">📋</div>
            <div className="text-sm font-black text-[#0f172a] mb-1">
              Yönetim Paketi
            </div>
            <div className="text-xs text-[#94a3b8] max-w-sm mx-auto leading-relaxed">
              Dönem seçin ve &ldquo;Paket Oluştur&rdquo; butonuna tıklayın.
              Tüm finansal tablolar, temel rasyolar ve yönetim uyarıları tek bir pakette derlenir.
            </div>
          </div>

          {/* Manifest checklist */}
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
                Pakete Dahil Edilecek Raporlar
              </span>
              <span className="text-[10px] text-[#94a3b8]">
                {CFO_PACK_MANIFEST.filter(r => r.required).length} zorunlu · {CFO_PACK_MANIFEST.filter(r => !r.required).length} opsiyonel
              </span>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {CFO_PACK_MANIFEST.map(report => (
                <div key={report.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-4 h-4 rounded border border-[#e8eaef] bg-[#f8fafc] flex-shrink-0 flex items-center justify-center">
                      <span className="text-[8px] text-[#94a3b8]">○</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#334155] truncate">{report.title}</div>
                      <div className="text-[9px] text-[#94a3b8]">{report.title_en}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${categoryColor(report.category)}`}>
                      {categoryLabel(report.category)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      report.required
                        ? 'bg-[#0f172a] text-white'
                        : 'bg-[#f1f5f9] text-[#64748b]'
                    }`}>
                      {report.required ? 'Zorunlu' : 'Opsiyonel'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#f1f5f9] text-[#94a3b8]">
                      Bekliyor
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pack download info */}
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
              Pack&apos;i İndir
            </div>
            <div className="text-xs text-[#64748b] leading-relaxed mb-3">
              &ldquo;Paket Oluştur&rdquo; butonuna tıklayarak aşağıdaki içeriklerle bir yönetim paketi oluşturabilirsiniz:
            </div>
            <ul className="space-y-1">
              {[
                'Tüm finansal tablolar (Bilanço, Gelir Tablosu, Nakit Akışı)',
                'Temel finansal rasyolar ve yorum',
                'Karar uyarıları ve risk analizi',
                'Ortak sermaye özeti',
                'Mizan ve KDV özeti',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#334155]">
                  <span className="text-pos-text font-black mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}

      {/* ── Result preview cards ─────────────────────────────────────────────── */}
      {state === 'done' && pack && d && (
        <>
          {/* Meta strip */}
          <div className="flex items-center gap-4 text-[10px] text-[#94a3b8]">
            <span className="font-black text-[#334155]">{pack.company_name}</span>
            <span>·</span>
            <span>{periodDisplayLabel(pack.period)}</span>
            <span>·</span>
            <span>Oluşturulma: {new Date(pack.generated_at).toLocaleString('tr-TR')}</span>
          </div>

          {/* Executive summary */}
          {d.executive_summary && (
            <SectionCard title="Durum Özeti">
              <div style={{ background: statusBg(d.executive_summary.status) }}
                className="rounded px-4 py-3 flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black"
                      style={{ color: statusColor(d.executive_summary.status) }}>
                      {statusLabel(d.executive_summary.status)}
                    </span>
                    <span className="text-[9px] font-bold text-[#94a3b8]">
                      Skor: {d.executive_summary.composite_score.toFixed(0)}/100
                    </span>
                  </div>
                  <div className="text-xs text-[#334155]">{d.executive_summary.situation_line}</div>
                  {d.executive_summary.critical_factor && (
                    <div className="text-[10px] text-[#64748b] mt-1">
                      Kritik faktör: {d.executive_summary.critical_factor}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {/* Two-column financial statements */}
          <div className="grid grid-cols-2 gap-4">

            {/* Balance sheet */}
            <SectionCard title="Bilanço" docHref={d.document_links.balance_sheet}>
              {d.balance_sheet ? (
                <div className="space-y-0.5">
                  <KpiRow label="Toplam Varlıklar"   value={fmtTRY(d.balance_sheet.total_assets)} />
                  <KpiRow label="Yabancı Kaynaklar"  value={fmtTRY(d.balance_sheet.total_liabilities)} />
                  <KpiRow label="Özsermaye"           value={fmtTRY(d.balance_sheet.total_equity)} />
                  <KpiRow label="Nakit"               value={fmtTRY(d.balance_sheet.cash)} />
                  <div className={`mt-2 text-[10px] font-semibold ${d.balance_sheet.balanced ? 'text-pos-text' : 'text-warn-text'}`}>
                    {d.balance_sheet.balanced ? '✓ Bilanço dengeli' : `⚠ Fark: ${fmtTRY(Math.abs(d.balance_sheet.imbalance_try))}`}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#94a3b8]">Veri mevcut değil</p>
              )}
            </SectionCard>

            {/* PnL */}
            <SectionCard title="Kâr / Zarar" docHref={d.document_links.income_statement}>
              {d.period_pnl ? (
                <div className="space-y-0.5">
                  <KpiRow label="Brüt Satış (KDV dâhil)" value={fmtTRY(d.period_pnl.revenue)} />
                  <KpiRow label="Brüt Kâr"         value={fmtTRY(d.period_pnl.gross_profit)} />
                  <KpiRow label="FAVÖK"             value={fmtTRY(d.period_pnl.ebitda)} />
                  <KpiRow label="Net Kâr"           value={fmtTRY(d.period_pnl.net_income)} />
                  <KpiRow label="Net KDV"           value={fmtTRY(d.period_pnl.net_vat)} />
                </div>
              ) : (
                <p className="text-xs text-[#94a3b8]">Veri mevcut değil</p>
              )}
            </SectionCard>

            {/* Cash flow */}
            <SectionCard title="Nakit Akışı">
              {d.cash_flow ? (
                <div className="space-y-0.5">
                  <KpiRow label="Faaliyet"     value={fmtTRY(d.cash_flow.operating)} />
                  <KpiRow label="Yatırım"      value={fmtTRY(d.cash_flow.investing)} />
                  <KpiRow label="Finansman"    value={fmtTRY(d.cash_flow.financing)} />
                  <KpiRow label="Net Değişim"  value={fmtTRY(d.cash_flow.net_change)} />
                  <KpiRow label="Kapanış Nakdi" value={fmtTRY(d.cash_flow.closing_balance)} />
                </div>
              ) : (
                <p className="text-xs text-[#94a3b8]">Veri mevcut değil</p>
              )}
            </SectionCard>

            {/* Key ratios */}
            <SectionCard title="Temel Rasyolar">
              <div className="space-y-0.5">
                <KpiRow label="Cari Oran"        value={fmtRatio(d.key_ratios.current_ratio)}   sub="(≥1.5 ideal)" />
                <KpiRow label="Borç Hizmet Oranı" value={fmtRatio(d.key_ratios.dsr, 3)}         sub="(DSR)" />
                <KpiRow label="Brüt Marj"        value={fmtPct(d.key_ratios.gross_margin_pct)}  />
                <KpiRow label="Net Marj"          value={fmtPct(d.key_ratios.net_margin_pct)}   />
                <KpiRow label="Kaldıraç Oranı"   value={fmtRatio(d.key_ratios.leverage_ratio)}  sub="(≤0.6 sağlıklı)" />
              </div>
            </SectionCard>

          </div>

          {/* Decision alerts */}
          {d.decision_alerts.length > 0 && (
            <SectionCard title={`Karar Uyarıları (${d.decision_alerts.length})`}>
              <div className="space-y-2">
                {d.decision_alerts.map(alert => (
                  <div key={alert.id}
                    style={{ background: alertBg(alert.severity), color: alertColor(alert.severity) }}
                    className="rounded px-3 py-2 flex items-start gap-2.5">
                    <span className="text-sm leading-none mt-0.5 font-black shrink-0">
                      {alertIcon(alert.severity)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black">{alert.title}</div>
                      {alert.detail && (
                        <div className="text-[10px] mt-0.5 opacity-80">{alert.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Partner summary */}
          {d.partner_summary.length > 0 && (
            <SectionCard title="Ortak Özeti">
              <div className="divide-y divide-[#f1f5f9]">
                {d.partner_summary.map(p => (
                  <div key={p.partner_id} className="flex items-center justify-between py-2 gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#334155]">{p.partner_name}</div>
                      <div className="text-[10px] text-[#94a3b8]">
                        %{(p.share_ratio * 100).toFixed(0)} hisse
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-right">
                      <div>
                        <div className="text-[9px] text-[#94a3b8]">Sermaye</div>
                        <div className="text-xs font-bold text-[#334155] tabular-nums">
                          {fmtTRY(p.equity_try)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[#94a3b8]">Net Borç</div>
                        <div className={`text-xs font-bold tabular-nums ${p.net_loan_try > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
                          {p.net_loan_try > 0 ? fmtTRY(p.net_loan_try) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

        </>
      )}

    </div>
  )
}
