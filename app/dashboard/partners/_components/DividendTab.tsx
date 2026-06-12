'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DividendTab — Temettü Beyan Takvimi
//
// Two sections:
//   1. Calculator — gross dividend input → live TTK 509/519 compliance check
//      + withholding tax deduction + per-partner allocation table
//   2. Declaration History — past dividend_declaration workflow instances
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type { DividendCalculation } from '@/lib/services/pcle/dividend.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowHistoryItem {
  id:           string
  status:       'pending' | 'approved' | 'rejected' | 'expired'
  initiated_at: string
  resolved_at:  string | null
  approver_id:  string | null
  payload:      {
    gross_dividend_try?:    number
    distributable_net_try?: number
    withholding_try?:       number
  }
  notes: string | null
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchCalculation(gross: number): Promise<DividendCalculation> {
  const res = await fetch('/api/partners/dividend/calculate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ gross_dividend_try: gross }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as DividendCalculation
}

async function declareWorkflow(gross: number, notes?: string): Promise<{ workflowId: string }> {
  const res = await fetch('/api/partners/dividend/declare', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ gross_dividend_try: gross, notes }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as { workflowId: string }
}

async function fetchHistory(): Promise<WorkflowHistoryItem[]> {
  const res = await fetch('/api/admin/workflows?type=dividend_declaration&limit=20')
  if (!res.ok) return []
  const data = await res.json().catch(() => null)
  return (Array.isArray(data) ? data : data?.workflows ?? data?.items ?? []) as WorkflowHistoryItem[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WorkflowHistoryItem['status'] }) {
  const map = {
    pending:  { cls: 'bg-warn-light text-warn-text border-warn-light', label: 'Onay Bekliyor' },
    approved: { cls: 'bg-pos-light text-pos-text border-pos-light',    label: 'Onaylandı' },
    rejected: { cls: 'bg-neg-light text-neg-text border-neg-light',    label: 'Reddedildi' },
    expired:  { cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]',  label: 'Süresi Doldu' },
  }
  const { cls, label } = map[status] ?? map.expired
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  )
}

function ComplianceRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`text-sm leading-none mt-0.5 ${ok ? 'text-pos-text' : 'text-neg'}`}>
        {ok ? '✓' : '✗'}
      </span>
      <div>
        <div className={`text-xs font-semibold ${ok ? 'text-[#1e293b]' : 'text-neg-text'}`}>{label}</div>
        {detail && <div className="text-[10px] text-[#94a3b8] mt-0.5">{detail}</div>}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DividendTab() {
  const [grossInput, setGrossInput]   = useState('')
  const [notesInput, setNotesInput]   = useState('')
  const [calcResult, setCalcResult]   = useState<DividendCalculation | null>(null)
  const [calcError,  setCalcError]    = useState<string | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [successMsg, setSuccessMsg]   = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: history, isLoading: histLoading } = useQuery<WorkflowHistoryItem[]>({
    queryKey: ['dividend-history'],
    queryFn:  fetchHistory,
    staleTime: 30_000,
  })

  const declareMutation = useMutation({
    mutationFn: ({ gross, notes }: { gross: number; notes?: string }) =>
      declareWorkflow(gross, notes),
    onSuccess: (data) => {
      setSuccessMsg(`Temettü beyanı başlatıldı (ID: ${data.workflowId.slice(0, 8)}…). Admin onayı bekleniyor.`)
      queryClient.invalidateQueries({ queryKey: ['dividend-history'] })
      setGrossInput('')
      setCalcResult(null)
    },
    onError: (err: Error) => {
      setCalcError(err.message)
    },
  })

  const handleCalculate = useCallback(async () => {
    const gross = parseFloat(grossInput.replace(/[.,\s]/g, '').replace(',', '.'))
    if (!isFinite(gross) || gross <= 0) {
      setCalcError('Geçerli bir tutar girin')
      return
    }
    setCalcLoading(true)
    setCalcError(null)
    setCalcResult(null)
    try {
      const result = await fetchCalculation(gross)
      setCalcResult(result)
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Hesaplama yapılamadı')
    }
    setCalcLoading(false)
  }, [grossInput])

  const handleDeclare = useCallback(() => {
    if (!calcResult?.can_declare) return
    const gross = calcResult.gross_dividend_try
    declareMutation.mutate({ gross, notes: notesInput.trim() || undefined })
  }, [calcResult, notesInput, declareMutation])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-5">

      {/* ── Section 1: Calculator ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Temettü Hesaplama</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">TTK 509/519 uyumu · GVK 94 §4 (%10 stopaj) · Ortak bazlı dağılım</p>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Input row */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Brüt Temettü Tutarı (₺)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Örn: 100000"
                value={grossInput}
                onChange={e => { setGrossInput(e.target.value); setCalcResult(null); setCalcError(null); setSuccessMsg(null) }}
                onKeyDown={e => e.key === 'Enter' && handleCalculate()}
                className="w-full px-3 py-2 border border-[#e8eaef] rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
              />
            </div>
            <button
              onClick={handleCalculate}
              disabled={calcLoading || !grossInput.trim()}
              className="px-4 py-2 bg-brand-light text-white text-xs font-semibold rounded hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {calcLoading ? 'Hesaplanıyor…' : 'Hesapla'}
            </button>
          </div>

          {calcError && (
            <div className="bg-neg-light border border-neg-light rounded px-3 py-2 text-xs text-neg-text">
              {calcError}
            </div>
          )}

          {successMsg && (
            <div className="bg-pos-light border border-pos-light rounded px-3 py-2 text-xs text-pos-text font-semibold">
              {successMsg}
            </div>
          )}

          {/* Calculation result */}
          {calcResult && (
            <div className="space-y-4 pt-1">

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-0 border border-[#e8eaef] rounded overflow-hidden">
                {[
                  {
                    label: 'Brüt Temettü',
                    value: fmtTRY(calcResult.gross_dividend_try),
                    tone:  'text-[#0f172a]',
                  },
                  {
                    label: 'Stopaj (%10)',
                    value: `−${fmtTRY(calcResult.withholding_try)}`,
                    tone:  'text-warn-text',
                  },
                  {
                    label: 'Net Dağıtım',
                    value: fmtTRY(calcResult.distributable_net_try),
                    tone:  calcResult.distributable_net_try > 0 ? 'text-pos-text' : 'text-neg',
                  },
                ].map((card, i) => (
                  <div key={card.label} className={`p-3 ${i < 2 ? 'border-r border-[#e8eaef]' : ''}`}>
                    <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{card.label}</div>
                    <div className={`text-base font-black tabular-nums ${card.tone}`}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* Compliance checks */}
              <div className="border border-[#e8eaef] rounded px-3 py-2 space-y-0">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Yasal Uyum</div>
                <ComplianceRow
                  ok={calcResult.ttk_509_satisfied}
                  label="TTK 509 — Dağıtılabilir Kâr"
                  detail={
                    calcResult.ytd_net_income_try > 0
                      ? `YTD net gelir: ${fmtTRY(calcResult.ytd_net_income_try)}`
                      : 'YTD net gelir yok'
                  }
                />
                <ComplianceRow
                  ok={calcResult.ttk_519_satisfied}
                  label="TTK 519 — Yasal Yedek"
                  detail={
                    calcResult.legal_reserve_satisfied
                      ? `Yasal yedek karşılandı (gerekli: ${fmtTRY(calcResult.required_legal_reserve_try)})`
                      : `Eksik yedek: ${fmtTRY(calcResult.legal_reserve_remaining_try)}`
                  }
                />

                {calcResult.blocking_reasons.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {calcResult.blocking_reasons.map((reason, i) => (
                      <div key={i} className="text-[10px] text-neg-text bg-neg-light border border-neg-light rounded px-2 py-1">
                        {reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-partner allocation */}
              {calcResult.partner_allocations.length > 0 && (
                <div className="border border-[#e8eaef] rounded overflow-hidden">
                  <div className="px-3 py-2 bg-[#f8fafc] border-b border-[#e8eaef]">
                    <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Ortak Bazlı Dağılım</div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#e8eaef]">
                        <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Ortak</th>
                        <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Pay %</th>
                        <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Brüt</th>
                        <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Stopaj</th>
                        <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-pos">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {calcResult.partner_allocations.map(p => (
                        <tr key={p.partner_id} className="hover:bg-[#f8fafc]/50">
                          <td className="px-3 py-2 font-medium text-[#1e293b]">{p.partner_name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                            %{p.share_ratio_pct.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#0f172a] font-semibold">
                            {fmtTRY(p.gross_share_try)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-warn-text">
                            −{fmtTRY(p.withholding_try)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-pos-text font-black">
                            {fmtTRY(p.net_share_try)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes + declare button */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5">
                    Not (isteğe bağlı)
                  </label>
                  <input
                    type="text"
                    placeholder="Temettü kararı hakkında not ekleyin…"
                    value={notesInput}
                    onChange={e => setNotesInput(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8eaef] rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-light/30 focus:border-brand-light"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeclare}
                    disabled={!calcResult.can_declare || declareMutation.isPending}
                    className="px-4 py-2 bg-brand-light text-white text-xs font-semibold rounded hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={!calcResult.can_declare ? calcResult.blocking_reasons.join('\n') : undefined}
                  >
                    {declareMutation.isPending ? 'İşleniyor…' : 'Temettü Beyan Et'}
                  </button>
                  {!calcResult.can_declare && (
                    <span className="text-[10px] text-neg-text">
                      {calcResult.blocking_reasons.length} uyum sorunu giderilmeli
                    </span>
                  )}
                  {calcResult.can_declare && (
                    <span className="text-[10px] text-[#94a3b8]">
                      Admin onayına gönderilecek
                    </span>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Declaration History ─────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Temettü Beyan Geçmişi</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Onay akışına gönderilmiş temettü beyanları</p>
        </div>

        {histLoading ? (
          <div className="px-4 py-6 text-center text-xs text-[#94a3b8]">Yükleniyor…</div>
        ) : !history || history.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[#94a3b8]">
            Henüz temettü beyanı yok
          </div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {history.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#1e293b]">Temettü Beyanı</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="text-[10px] text-[#94a3b8] mt-0.5">
                    {fmtDate(item.initiated_at)}
                    {item.resolved_at && ` · Çözüm: ${fmtDate(item.resolved_at)}`}
                    {item.notes && ` · ${item.notes}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {item.payload.gross_dividend_try != null && (
                    <div className="text-sm font-black tabular-nums text-[#0f172a]">
                      {fmtTRY(item.payload.gross_dividend_try)}
                    </div>
                  )}
                  {item.payload.distributable_net_try != null && (
                    <div className="text-[10px] text-[#94a3b8]">
                      Net: {fmtTRY(item.payload.distributable_net_try)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
