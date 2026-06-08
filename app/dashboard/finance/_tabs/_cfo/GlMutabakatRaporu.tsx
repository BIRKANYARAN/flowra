// ── GlMutabakatRaporu — GL reconciliation section, extracted from CFOTab.tsx ───
// Self-contained presentational section (+ ReconciliationStatusChip). Verbatim.

import Link from 'next/link'
import { fmtTRY } from '@/lib/format'
import type { GlReconciliationReport, ReconciliationItem } from '@/lib/services/ledger/gl-reconciliation.service'

// ── GL Mutabakat sub-component ────────────────────────────────────────────────

function ReconciliationStatusChip({ status }: { status: ReconciliationItem['status'] }) {
  const map: Record<ReconciliationItem['status'], { label: string; cls: string }> = {
    balanced:    { label: 'Dengeli',      cls: 'bg-pos-light text-pos-text border-pos-light' },
    discrepancy: { label: 'Uyuşmazlık',   cls: 'bg-neg-light text-neg-text border-neg-light' },
    no_gl_data:  { label: 'GL Verisi Yok', cls: 'bg-[#f1f5f9] text-[#94a3b8] border-[#e8eaef]' },
    skipped:     { label: 'Atlandı',      cls: 'bg-[#f1f5f9] text-[#94a3b8] border-[#e8eaef]' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
  )
}

export function GlMutabakatRaporu({ report }: { report: GlReconciliationReport }) {
  const { all_balanced, discrepancy_count, trial_balance, items, gl_mode, status_label, total_discrepancy_try } = report

  const bannerCls = all_balanced
    ? 'bg-pos-light border-pos-light text-pos-text'
    : 'bg-neg-light border-neg-light text-neg-text'

  const modeLabel = gl_mode === 'parallel' ? 'Paralel'
    : gl_mode === 'shadow'   ? 'Shadow'
    : gl_mode === 'gl_primary' ? 'GL Primer' : gl_mode

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            GL Mutabakat Raporu
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {report.period_label} · GL vs Operasyonel Tablolar
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]">
            Mod: {modeLabel}
          </span>
          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${bannerCls}`}>
            {all_balanced ? '✓ Tüm hesaplar dengeli' : `⚠ ${discrepancy_count} uyuşmazlık tespit edildi`}
          </span>
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded px-3 py-2 border mb-3 text-xs font-semibold flex items-center justify-between ${bannerCls}`}>
        <span>{status_label}</span>
        {!all_balanced && total_discrepancy_try > 0 && (
          <span className="tabular-nums font-bold">Toplam fark: {fmtTRY(total_discrepancy_try)}</span>
        )}
      </div>

      {/* Trial Balance check */}
      <div className={`rounded px-3 py-2 border mb-3 text-xs ${
        trial_balance.is_balanced
          ? 'bg-pos-light border-pos-light text-pos-text'
          : 'bg-neg-light border-neg-light text-neg-text'
      }`}>
        <div className="flex items-center justify-between font-semibold mb-0.5">
          <span>Mizan Kontrolü (Çift Taraflı Kayıt)</span>
          <span className={trial_balance.is_balanced ? 'text-pos-text' : 'text-neg-text font-bold'}>
            {trial_balance.is_balanced ? '✓ Dengeli' : `⚠ Fark: ${fmtTRY(trial_balance.imbalance)}`}
          </span>
        </div>
        <div className="flex gap-4 text-[10px] opacity-80">
          <span>DR: {fmtTRY(trial_balance.total_debits)}</span>
          <span>CR: {fmtTRY(trial_balance.total_credits)}</span>
          <span>{trial_balance.entry_count} kayıt · {trial_balance.line_count} satır</span>
        </div>
      </div>

      {/* Items table */}
      {all_balanced ? (
        <div className="text-xs text-[#94a3b8] text-center py-3 bg-pos-light rounded border border-pos-light text-pos-text font-semibold">
          ✓ Uyuşmazlık yok — tüm hesaplar GL ile operasyonel tablolar arasında dengeli
        </div>
      ) : (
        <div className="border border-[#e8eaef] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                <th className="text-left px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesap</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">GL</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Operasyonel</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Fark %</th>
                <th className="text-center px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {items.map((item) => (
                <tr key={item.label} className="hover:bg-[#f8fafc]/60">
                  <td className="px-3 py-2 text-[#334155] font-medium">
                    {item.label}
                    {item.notes && (
                      <div className="text-[10px] text-[#94a3b8] font-normal mt-0.5">{item.notes}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0f172a]">
                    {item.gl_amount !== null ? fmtTRY(item.gl_amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0f172a]">
                    {item.ops_amount !== null ? fmtTRY(item.ops_amount) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-mono ${
                    item.discrepancy_pct === null ? 'text-[#94a3b8]'
                    : Math.abs(item.discrepancy_pct) < 5 ? 'text-pos-text'
                    : Math.abs(item.discrepancy_pct) < 20 ? 'text-warn-text'
                    : 'text-neg-text'
                  }`}>
                    {item.discrepancy_pct !== null
                      ? `${item.discrepancy_pct >= 0 ? '+' : ''}${item.discrepancy_pct.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ReconciliationStatusChip status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-[#94a3b8]">
          {new Date(report.computed_at).toLocaleString('tr-TR')} itibarıyla hesaplandı
        </span>
        <Link
          href="/dashboard/cfo/reconciliation"
          className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2"
        >
          Detaylı mutabakat →
        </Link>
      </div>
    </div>
  )
}
