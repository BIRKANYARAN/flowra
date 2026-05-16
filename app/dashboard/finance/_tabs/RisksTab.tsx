// ── RisksTab — Alacak Riski ve Konsantrasyon Analizi ─────────────────────────
//
// Powered by lib/finance/risk-engine.ts
//
// Zones:
//   1. Risk özeti (4 KPIs: total, overdue, concentration, HHI)
//   2. Konsantrasyon sinyali (top 5 + bar)
//   3. Müşteri yaşlandırma tablosu
//   4. CFO tavsiyesi

import { getRiskEngineResult } from '@/lib/finance/risk-engine'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number): string {
  const abs  = Math.abs(Number(n || 0))
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${TRY.format(abs)}`
}
function pct(v: number): string {
  return `%${(v * 100).toFixed(1).replace('.', ',')}`
}

// ── Risk level helpers ────────────────────────────────────────────────────────

const RISK_COLORS = {
  low:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Düşük Risk', border: 'border-emerald-200' },
  moderate: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Orta Risk',  border: 'border-amber-200'   },
  high:     { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Yüksek Risk', border: 'border-orange-200' },
  critical: { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Kritik',     border: 'border-red-200'     },
} as const

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function RisksTab({ userId: _userId, companyId }: Props) {
  const risk = await getRiskEngineResult(companyId).catch(() => ({
    asOf: new Date().toISOString().slice(0, 10),
    totalOutstanding: 0, customerCount: 0, aging: [],
    concentration: { top1_pct: 0, top3_pct: 0, hhi: 0, risk_level: 'low' as const },
    overdueTotal: 0, overdue30Total: 0, overdue60Total: 0, overdue90Total: 0,
  }))

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
      <div className="bg-white border border-gray-100 rounded-2xl text-center py-16">
        <div className="text-4xl mb-3">✅</div>
        <div className="text-sm font-black text-gray-900 mb-1">Açık Alacak Yok</div>
        <div className="text-xs text-gray-400">Tüm faturalar tahsil edilmiş görünüyor.</div>
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
            tone:  'text-gray-900',
          },
          {
            label: 'Vadesi Geçmiş',
            value: fmt(risk.overdueTotal),
            sub:   `${pct(overdueRate)} vadesi aştı`,
            tone:  overdueRate > 0.3 ? 'text-red-600' : overdueRate > 0 ? 'text-amber-600' : 'text-gray-400',
          },
          {
            label: 'Konsantrasyon (Top 1)',
            value: pct(risk.concentration.top1_pct),
            sub:   riskCfg.label,
            tone:  risk.concentration.risk_level === 'low' ? 'text-emerald-700' :
                   risk.concentration.risk_level === 'moderate' ? 'text-amber-700' : 'text-red-600',
          },
          {
            label: 'HHI Endeksi',
            value: risk.concentration.hhi.toFixed(0),
            sub:   risk.concentration.hhi < 1500 ? 'Rekabetçi' :
                   risk.concentration.hhi < 2500 ? 'Orta Konsantrasyon' : 'Yüksek Konsantrasyon',
            tone:  risk.concentration.hhi < 1500 ? 'text-emerald-700' :
                   risk.concentration.hhi < 2500 ? 'text-amber-700' : 'text-red-600',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Zone 2 — Konsantrasyon */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Konsantrasyon Analizi</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Top müşterilerin toplam alacak içindeki payı</div>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${riskCfg.bg} ${riskCfg.text} ${riskCfg.border}`}>
            {riskCfg.label}
          </span>
        </div>
        <div className="space-y-2">
          {risk.aging.slice(0, 5).map((c, i) => {
            const share = risk.totalOutstanding > 0 ? c.total_outstanding / risk.totalOutstanding : 0
            return (
              <div key={c.customer_id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="font-semibold text-gray-700 truncate max-w-[200px]">
                    {i === 0 ? '🔝 ' : ''}{c.customer_name}
                  </span>
                  <span className="font-bold text-gray-600 tabular-nums">
                    {fmt(c.total_outstanding)} · {pct(share)}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      share > 0.4 ? 'bg-red-400' : share > 0.2 ? 'bg-amber-400' : 'bg-primary-400'
                    }`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
          {risk.aging.length > 5 && (
            <div className="text-[10px] text-gray-400 pt-1">
              +{risk.aging.length - 5} müşteri daha ({fmt(risk.aging.slice(5).reduce((s, c) => s + c.total_outstanding, 0))})
            </div>
          )}
        </div>
      </div>

      {/* Zone 3 — Aging table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-black text-gray-800">Müşteri Yaşlandırma Analizi</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">Alacakların vade kırılımı</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Müşteri</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Toplam</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Güncel</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">+30g</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-orange-400">+60g</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-400">+90g</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {risk.aging.map(c => (
                <tr key={c.customer_id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 truncate max-w-[160px]">{c.customer_name}</div>
                    {c.oldest_invoice_date && (
                      <div className="text-[9px] text-gray-400">İlk: {c.oldest_invoice_date}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-black tabular-nums text-gray-900">{fmt(c.total_outstanding)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {c.current > 0 ? fmt(c.current) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                    {c.overdue_30d > 0 ? fmt(c.overdue_30d) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-orange-700">
                    {c.overdue_60d > 0 ? fmt(c.overdue_60d) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-red-700">
                    {c.overdue_90d > 0 ? fmt(c.overdue_90d) : <span className="text-gray-200">—</span>}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-gray-50 font-black border-t-2 border-gray-200">
                <td className="px-4 py-3 text-xs font-black text-gray-700">Toplam</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-gray-900">{fmt(risk.totalOutstanding)}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-emerald-700">
                  {fmt(risk.totalOutstanding - risk.overdueTotal)}
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-amber-700">{fmt(risk.overdue30Total)}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-orange-700">{fmt(risk.overdue60Total)}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-red-700">{fmt(risk.overdue90Total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Zone 4 — Guidance */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">CFO Tavsiyesi</div>
        <ul className="space-y-1.5">
          {guidance.map((g, i) => (
            <li key={i} className="text-xs text-gray-700 leading-relaxed flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-[10px]">→</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
