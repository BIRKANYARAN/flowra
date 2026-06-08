// Çeyreklik Analitik — quarterly P&L + geçici-vergi schedule card. Extracted
// verbatim from CFOTab.tsx. Pure presentational server component driven by the
// QuarterlyReportResult; renders nothing when there are no quarters.
import { fmtTRY, fmtDateMed } from '@/lib/format'
import { type QuarterResult, type QuarterlyReportResult } from '@/lib/finance/financial-core'

export function CeyreklikAnalitik({ quarterlyReport, today }: { quarterlyReport: QuarterlyReportResult | null; today: string }) {
  if (!quarterlyReport || quarterlyReport.quarters.length === 0) return null
        const qs  = quarterlyReport.quarters
        const ytd = quarterlyReport.ytd
        const currentYear = quarterlyReport.year
        function fmtPctQ(r: number): string {
          return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
        }
        function deltaQ(curr: number, prev: number) {
          if (prev === 0) return { text: '—', color: 'text-[#94a3b8]' }
          const p = ((curr - prev) / Math.abs(prev)) * 100
          return { text: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, color: p >= 0 ? 'text-pos-text' : 'text-neg' }
        }
        const addDaysQ = (dateStr: string, n: number) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
        const fmtDateQ = fmtDateMed

        return (
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black text-[#0f172a]">Çeyreklik Analitik — {currentYear}</h2>
                <p className="text-[10px] text-[#94a3b8] mt-0.5">YTD P&L · Çeyreklik performans · Geçici vergi takvimi</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8]">YTD Ciro</div>
                  <div className="text-xs font-black text-[#0f172a] tabular-nums">{fmtTRY(ytd.revenue)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8]">Net Kâr</div>
                  <div className={`text-xs font-black tabular-nums ${ytd.net_after_tax >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(ytd.net_after_tax)}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                    <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Çeyrek</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ciro</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-brand-light">Brüt Kâr</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Net Kâr</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj</th>
                    <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-warn">KV Matrahı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {qs.map((q: QuarterResult, i: number) => {
                    const prev = i > 0 ? qs[i - 1] : null
                    const revDelta = prev && prev.revenue > 0 ? deltaQ(q.revenue, prev.revenue) : null
                    const isFuture = !q.is_past_quarter && q.period.from > today
                    return (
                      <tr key={q.label} className={`hover:bg-[#f8fafc]/60 ${isFuture ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-2.5 font-black text-[#0f172a] text-xs">{q.label}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="font-mono font-bold text-[#0f172a]">{fmtTRY(q.revenue)}</div>
                          {revDelta && <div className={`text-[10px] font-semibold ${revDelta.color}`}>{revDelta.text}</div>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>{fmtTRY(q.gross_profit)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(q.net_profit)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${q.gross_margin >= 0.3 ? 'text-pos-text' : q.gross_margin >= 0.1 ? 'text-warn-text' : 'text-neg'}`}>
                          {q.revenue > 0 ? fmtPctQ(q.gross_margin) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${q.matrah > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>{q.matrah > 0 ? fmtTRY(q.matrah) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-brand-subtle/40 font-black border-t-2 border-brand/10">
                    <td className="px-4 py-2.5 text-brand font-black text-xs">YTD Toplam</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-[#0f172a]">{fmtTRY(ytd.revenue)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>{fmtTRY(ytd.gross_profit)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>{fmtTRY(ytd.net_profit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[#64748b]">{ytd.revenue > 0 ? fmtPctQ(ytd.gross_profit / ytd.revenue) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-black ${ytd.matrah > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>{ytd.matrah > 0 ? fmtTRY(ytd.matrah) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Gecici vergi schedule if any */}
            {qs.some((q: QuarterResult) => q.gecici_vergi > 0) && (
              <div className="border-t border-[#e8eaef]">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Geçici Vergi Takvimi {currentYear}</div>
                  <span className="text-xs font-bold text-warn-text bg-warn-light border border-warn-light px-2 py-0.5 rounded">Toplam {fmtTRY(ytd.total_gecici)}</span>
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {qs.filter((q: QuarterResult) => q.gecici_vergi > 0 && q.gecici_due_date).map((q: QuarterResult) => {
                    if (!q.gecici_due_date) return null
                    const isPast   = q.gecici_due_date <= today
                    const isUrgent = !isPast && q.gecici_due_date <= addDaysQ(today, 30)
                    return (
                      <div key={q.label} className={`px-4 py-2.5 flex items-center justify-between gap-4 ${isUrgent ? 'bg-warn-light/40' : ''}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1e293b]">{q.label} Geçici Vergi</span>
                            {isPast && <span className="text-[9px] bg-[#f1f5f9] text-[#94a3b8] px-1.5 py-0.5 rounded">Geçti</span>}
                            {isUrgent && !isPast && <span className="text-[9px] bg-warn-light text-warn-text font-bold px-1.5 py-0.5 rounded">30 gün içinde</span>}
                          </div>
                          <div className="text-[10px] text-[#94a3b8] mt-0.5">Son ödeme: {fmtDateQ(q.gecici_due_date)} · Matrah: {fmtTRY(q.matrah)}</div>
                        </div>
                        <div className={`text-xs font-black tabular-nums ${isPast ? 'text-[#94a3b8]' : isUrgent ? 'text-warn-text' : 'text-warn-text'}`}>{fmtTRY(q.gecici_vergi)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
}
