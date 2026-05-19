// ── RisksTab — Alacak Riski ve Konsantrasyon Analizi ─────────────────────────
//
// Powered by lib/finance/risk-engine.ts + lib/engines/anomaly.engine.ts
//
// Zones:
//   1. Risk özeti (4 KPIs: total, overdue, concentration, HHI)
//   2. Konsantrasyon sinyali (top 5 + bar)
//   3. Müşteri yaşlandırma tablosu
//   4. Anormallik Tespiti (statistical revenue + expense anomalies)
//   5. CFO tavsiyesi

import Link                      from 'next/link'
import { getRiskEngineResult }   from '@/lib/finance/risk-engine'
import {
  detectRevenueAnomalies,
  detectExpenseAnomalies,
  type MonthlyRevenue,
  type MonthlyExpense,
} from '@/lib/engines/anomaly.engine'
import { createClient }          from '@/lib/supabase-server'
import { fmtTRY as fmt }         from '@/lib/format'
function pct(v: number): string {
  return `%${(v * 100).toFixed(1).replace('.', ',')}`
}

// ── Risk level helpers ────────────────────────────────────────────────────────

const RISK_COLORS = {
  low:      { bg: 'bg-pos-light', text: 'text-pos-text', label: 'Düşük Risk', border: 'border-pos-light' },
  moderate: { bg: 'bg-warn-light',   text: 'text-warn-text',   label: 'Orta Risk',  border: 'border-warn-light'   },
  high:     { bg: 'bg-warn-light',  text: 'text-warn-text',  label: 'Yüksek Risk', border: 'border-warn/20' },
  critical: { bg: 'bg-neg-light',     text: 'text-neg-text',     label: 'Kritik',     border: 'border-neg-light'     },
} as const

// ── Component ─────────────────────────────────────────────────────────────────

const SEVERITY_CFG = {
  high:   { cls: 'bg-neg-light border-neg-light text-neg-text',    dot: 'bg-neg',         label: 'Yüksek' },
  medium: { cls: 'bg-warn-light border-warn-light text-warn-text', dot: 'bg-warn',        label: 'Orta'  },
  low:    { cls: 'bg-[#f8fafc] border-[#e2e8f0] text-[#64748b]',  dot: 'bg-[#cbd5e1]',  label: 'Düşük' },
} as const

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel', rent: 'Kira', salary: 'Maaş', utilities: 'Faturalar',
  marketing: 'Pazarlama', logistics: 'Lojistik', software: 'Yazılım',
  equipment: 'Ekipman', tax: 'Vergi', interest: 'Faiz', other: 'Diğer',
}

interface Props { userId: string; companyId: string }

export async function RisksTab({ userId: _userId, companyId }: Props) {
  const supabase = createClient()

  // Build trailing 7-month range for anomaly engine
  const anomalyMonths: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    anomalyMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const anomalyFrom = anomalyMonths[0] + '-01'
  const anomalyTo   = new Date().toISOString().slice(0, 10)

  const [risk, salesAnomalyRes, expAnomalyRes] = await Promise.all([
    getRiskEngineResult(companyId).catch(() => ({
      asOf: new Date().toISOString().slice(0, 10),
      totalOutstanding: 0, customerCount: 0, aging: [],
      concentration: { top1_pct: 0, top3_pct: 0, hhi: 0, risk_level: 'low' as const },
      overdueTotal: 0, overdue30Total: 0, overdue60Total: 0, overdue90Total: 0,
    })),
    // Revenue by month for anomaly engine
    supabase.from('sales')
      .select('total_try:total, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', anomalyFrom)
      .lte('sale_date', anomalyTo)
      .then(r => r.data ?? []),
    // Expenses by category+month for anomaly engine
    supabase.from('expenses')
      .select('amount_try, expense_type, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', anomalyFrom)
      .lte('expense_date', anomalyTo)
      .then(r => r.data ?? []),
  ])

  // Build MonthlyRevenue input
  const revByMonth: Record<string, number> = {}
  for (const m of anomalyMonths) revByMonth[m] = 0
  for (const s of salesAnomalyRes) {
    const m = (s.sale_date as string | null)?.slice(0, 7) ?? ''
    if (m) revByMonth[m] = (revByMonth[m] ?? 0) + Number(s.total_try ?? 0)
  }
  const monthlyRevenue: MonthlyRevenue[] = Object.entries(revByMonth)
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Build MonthlyExpense input
  const expMap: Record<string, Record<string, number>> = {}
  for (const e of expAnomalyRes) {
    const m   = (e.expense_date as string)?.slice(0, 7)
    const cat = (e.expense_type as string) ?? 'general'
    if (!m) continue
    if (!expMap[cat]) expMap[cat] = {}
    expMap[cat][m] = (expMap[cat][m] ?? 0) + Number(e.amount_try ?? 0)
  }
  const monthlyExpenses: MonthlyExpense[] = []
  for (const [category, byMonth] of Object.entries(expMap)) {
    for (const [month, amount] of Object.entries(byMonth)) {
      monthlyExpenses.push({ month, category, amount })
    }
  }

  const revenueAnomalies = detectRevenueAnomalies(monthlyRevenue)
  const expenseAnomalies = detectExpenseAnomalies(monthlyExpenses)
  const allAnomalies     = [...revenueAnomalies, ...expenseAnomalies]
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 }
      return rank[a.severity] - rank[b.severity]
    })
    .slice(0, 8) // cap at 8 signals

  const riskCfg = RISK_COLORS[risk.concentration.risk_level]
  const overdueRate = risk.totalOutstanding > 0
    ? risk.overdueTotal / risk.totalOutstanding : 0

  // Guidance generation
  const guidance: string[] = []
  if (risk.concentration.risk_level === 'critical') {
    guidance.push('⚠ Tek bir müşteri alacaklarınızın %60\'ından fazlasını oluşturuyor — bu kritik bir konsantrasyon riskidir.')
    guidance.push('Bu müşteri ile ödeme planı müzakere edin ve yeni müşteri kazanımını hızlandırın.')
  } else if (risk.concentration.risk_level === 'high') {
    guidance.push('Alacak konsantrasyonu yüksek. En büyük 3 müşteri portföyünüzün %' + (risk.concentration.top3_pct * 100).toFixed(0) + '\'ini oluşturuyor.')
  }
  if (risk.overdue90Total > 0) {
    guidance.push(`${fmt(risk.overdue90Total)} tutarında alacak 90+ gün vadesi geçmiş — hukuki süreç veya karşılık ayrılması düşünülmeli.`)
  }
  if (overdueRate > 0.5) {
    guidance.push('Toplam alacaklarınızın yarısından fazlası vadesi geçmiş. Tahsilat süreçleri acilen güçlendirilmeli.')
  }
  if (guidance.length === 0 && risk.totalOutstanding === 0) {
    guidance.push('✓ Bekleyen alacak bulunmuyor.')
  } else if (guidance.length === 0) {
    guidance.push('✓ Konsantrasyon riski düşük ve alacaklar zamanında tahsil ediliyor.')
  }

  if (risk.totalOutstanding === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded text-center py-12">
        <div className="text-xs font-medium text-[#334155] mb-1">Açık alacak yok</div>
        <div className="text-[0.65rem] text-[#94a3b8]">Tüm faturalar tahsil edilmiş görünüyor</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Zone 1 — Risk KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'Toplam Açık Alacak',
            value: fmt(risk.totalOutstanding),
            sub:   `${risk.customerCount} müşteri`,
            tone:  'text-[#0f172a]',
          },
          {
            label: 'Vadesi Geçmiş',
            value: fmt(risk.overdueTotal),
            sub:   `${pct(overdueRate)} vadesi aştı`,
            tone:  overdueRate > 0.3 ? 'text-neg' : overdueRate > 0 ? 'text-warn-text' : 'text-[#94a3b8]',
          },
          {
            label: 'Konsantrasyon (Top 1)',
            value: pct(risk.concentration.top1_pct),
            sub:   riskCfg.label,
            tone:  risk.concentration.risk_level === 'low' ? 'text-pos-text' :
                   risk.concentration.risk_level === 'moderate' ? 'text-warn-text' : 'text-neg',
          },
          {
            label: 'HHI Endeksi',
            value: risk.concentration.hhi.toFixed(0),
            sub:   risk.concentration.hhi < 1500 ? 'Rekabetçi' :
                   risk.concentration.hhi < 2500 ? 'Orta Konsantrasyon' : 'Yüksek Konsantrasyon',
            tone:  risk.concentration.hhi < 1500 ? 'text-pos-text' :
                   risk.concentration.hhi < 2500 ? 'text-warn-text' : 'text-neg',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Zone 2 — Konsantrasyon */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Konsantrasyon Analizi</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Top müşterilerin toplam alacak içindeki payı</div>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded border ${riskCfg.bg} ${riskCfg.text} ${riskCfg.border}`}>
            {riskCfg.label}
          </span>
        </div>
        <div className="space-y-2">
          {risk.aging.slice(0, 5).map((c, i) => {
            const share = risk.totalOutstanding > 0 ? c.total_outstanding / risk.totalOutstanding : 0
            return (
              <div key={c.customer_id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="font-semibold text-[#334155] truncate max-w-[200px]">
                    {i === 0 ? '🔝 ' : ''}{c.customer_name}
                  </span>
                  <span className="font-bold text-[#64748b] tabular-nums">
                    {fmt(c.total_outstanding)} · {pct(share)}
                  </span>
                </div>
                <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      share > 0.4 ? 'bg-neg' : share > 0.2 ? 'bg-warn' : 'bg-primary-400'
                    }`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
          {risk.aging.length > 5 && (
            <div className="text-[10px] text-[#94a3b8] pt-1">
              +{risk.aging.length - 5} müşteri daha ({fmt(risk.aging.slice(5).reduce((s, c) => s + c.total_outstanding, 0))})
            </div>
          )}
        </div>
      </div>

      {/* Zone 3 — Aging table */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <h2 className="text-sm font-black text-[#1e293b]">Müşteri Yaşlandırma Analizi</h2>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Alacakların vade kırılımı</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Müşteri</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Güncel</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-warn">+30g</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-warn">+60g</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-neg">+90g</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {risk.aging.map(c => (
                <tr key={c.customer_id} className="hover:bg-[#f8fafc]/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#1e293b] truncate max-w-[160px]">{c.customer_name}</div>
                    {c.oldest_invoice_date && (
                      <div className="text-[9px] text-[#94a3b8]">İlk: {c.oldest_invoice_date}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-black tabular-nums text-[#0f172a]">{fmt(c.total_outstanding)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-pos-text">
                    {c.current > 0 ? fmt(c.current) : <span className="text-[#e2e8f0]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-warn-text">
                    {c.overdue_30d > 0 ? fmt(c.overdue_30d) : <span className="text-[#e2e8f0]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-warn-text">
                    {c.overdue_60d > 0 ? fmt(c.overdue_60d) : <span className="text-[#e2e8f0]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-neg-text">
                    {c.overdue_90d > 0 ? fmt(c.overdue_90d) : <span className="text-[#e2e8f0]">—</span>}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-[#f8fafc] font-black border-t-2 border-[#e2e8f0]">
                <td className="px-4 py-3 text-xs font-black text-[#334155]">Toplam</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-[#0f172a]">{fmt(risk.totalOutstanding)}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-pos-text">
                  {fmt(risk.totalOutstanding - risk.overdueTotal)}
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-warn-text">{fmt(risk.overdue30Total)}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-warn-text">{fmt(risk.overdue60Total)}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-neg-text">{fmt(risk.overdue90Total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Zone 4 — Anomaly Detection */}
      {allAnomalies.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Anormallik Tespiti</div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">Son 6 ay istatistiksel sapma analizi · ±2σ eşiği</div>
            </div>
            <span className="text-[9px] font-black uppercase tracking-wide bg-brand-subtle text-brand px-2 py-0.5 rounded">
              {allAnomalies.filter(a => a.severity === 'high').length} yüksek · {allAnomalies.filter(a => a.severity === 'medium').length} orta
            </span>
          </div>
          <div className="space-y-2">
            {allAnomalies.map((a, i) => {
              const cfg = SEVERITY_CFG[a.severity]
              const typeLabel = a.type === 'revenue' ? 'Gelir' : `Gider — ${CATEGORY_LABELS[(a as { category?: string }).category ?? ''] ?? (a as { category?: string }).category ?? ''}`
              const monthLabel = (() => {
                const m = a.month
                const [y, mo] = m.split('-').map(Number)
                const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
                return `${names[mo - 1]} ${String(y).slice(2)}`
              })()
              return (
                <div key={i} className={`flex items-start gap-3 border rounded px-3 py-2.5 ${cfg.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wide">{typeLabel}</span>
                      <span className="text-[9px] font-semibold opacity-60">{monthLabel}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        a.direction === 'spike'
                          ? 'bg-warn-light text-warn-text'
                          : 'bg-info-light text-info-text'
                      }`}>
                        {a.direction === 'spike' ? '▲ Ani Artış' : '▼ Ani Düşüş'}
                        {' '}{Math.abs(a.deviation_pct).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-[#334155] mt-0.5 leading-snug">{a.message}</div>
                    <div className="text-[9px] text-[#64748b] mt-0.5">
                      Gerçekleşen: <strong>{fmt(a.actual)}</strong> · Beklenen ort.: {fmt(a.mean)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Zone 5 — Guidance */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">CFO Tavsiyesi</div>
        <ul className="space-y-1.5">
          {guidance.map((g, i) => (
            <li key={i} className="text-xs text-[#334155] leading-relaxed flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-[10px]">→</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Risk analizi tahsilat ve müşteri skorlarıyla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/commercial?tab=collections"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Tahsilat →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link
            href="/dashboard/commercial?tab=customers"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Müşteri Riskleri →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link
            href="/dashboard/operations?tab=expenses"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Giderler →
          </Link>
        </div>
      </div>
    </div>
  )
}
