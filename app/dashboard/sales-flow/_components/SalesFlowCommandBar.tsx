// ── SalesFlowCommandBar — Pipeline İstihbarat Şeridi ─────────────────────────
//
// Server component — renders above SalesFlowClient with zero client JS.
// Shows live pipeline health: conversion metrics, MTD revenue, win rate,
// and stale-proposal aging alert.
//
// Zones:
//   LEFT  — 4 KPI pills: Açık Teklif · MTD Satış · Kazanma Oranı · Dönüşüm
//   RIGHT — Pipeline funnel mini-viz (draft → sent → accepted → converted)
//   ALERT — Stale proposals: sent proformas older than 15 days with no reply
//
// Data: single parallel Supabase query on proformas + sales (this month).

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { fmtTRY as fmt } from '@/lib/format'

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export async function SalesFlowCommandBar({ companyId }: Props) {
  const supabase  = createClient()
  const now       = new Date()
  const today     = now.toISOString().slice(0, 10)
  const year      = now.getFullYear()
  const mon       = String(now.getMonth() + 1).padStart(2, '0')
  const mtdFrom   = `${year}-${mon}-01`
  const staleDate = new Date(now.getTime() - 15 * 86_400_000).toISOString().slice(0, 10)

  // ── Parallel queries ────────────────────────────────────────────────────────
  const [pfRes, salesMtdRes, staleRes] = await Promise.all([
    // All proformas: status + total for funnel
    supabase
      .from('proformas')
      .select('id, status, total, currency, created_at, customer_name')
      .eq('company_id', companyId)
      .is('deleted_at', null),

    // MTD sales: invoiced this month (by sale_date — business invoice date, not DB insertion time)
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', mtdFrom),

    // Stale sent proformas: sent > 15 days ago, not yet converted/accepted/rejected
    supabase
      .from('proformas')
      .select('id, customer_name, total, currency, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('status', 'sent')
      .lt('created_at', staleDate)
      .order('created_at', { ascending: true })
      .limit(3),
  ])

  const proformas  = pfRes.data      ?? []
  const salesMtd   = salesMtdRes.data ?? []
  const staleRows  = staleRes.data   ?? []

  // ── Funnel counts ───────────────────────────────────────────────────────────
  const funnel = {
    draft:     proformas.filter(p => p.status === 'draft').length,
    sent:      proformas.filter(p => p.status === 'sent').length,
    accepted:  proformas.filter(p => p.status === 'accepted').length,
    converted: proformas.filter(p => p.status === 'converted').length,
    rejected:  proformas.filter(p => p.status === 'rejected').length,
  }

  // Open pipeline value (sent + accepted)
  const openPipelineValue = proformas
    .filter(p => p.status === 'sent' || p.status === 'accepted')
    .reduce((s, p) => s + Number(p.total ?? 0), 0)

  const openPipelineCount = funnel.sent + funnel.accepted

  // Win rate: converted / (converted + rejected) — excluding draft/sent/accepted
  const decided  = funnel.converted + funnel.rejected
  const winRate  = decided > 0 ? (funnel.converted / decided) * 100 : null

  // Conversion rate: converted / total (all-time)
  const total        = proformas.length
  const conversionRate = total > 0 ? (funnel.converted / total) * 100 : null

  // MTD revenue
  const mtdRevenue = salesMtd.reduce((s, r) => s + Number(r.total_try ?? 0), 0)

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded text-xs text-gray-400">
        Henüz teklif kaydı yok — pipeline boş.
      </div>
    )
  }

  // Funnel max for bar scaling
  const funnelMax = Math.max(funnel.draft, funnel.sent, funnel.accepted + funnel.converted + funnel.rejected, 1)

  const funnelSteps = [
    { label: 'Taslak',    count: funnel.draft,     color: 'bg-gray-300'     },
    { label: 'Gönderildi', count: funnel.sent,     color: 'bg-info'     },
    { label: 'Onaylandı',  count: funnel.accepted, color: 'bg-pos'  },
    { label: 'Satıldı',    count: funnel.converted, color: 'bg-primary-500' },
  ]

  return (
    <div className="space-y-2">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Açık Pipeline */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e2e8f0] rounded">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Açık Pipeline</span>
          {openPipelineValue > 0
            ? <span className="text-sm font-black tabular-nums text-info-text">{fmt(openPipelineValue)}</span>
            : <span className="text-sm font-black text-gray-400">—</span>
          }
          <span className="text-[9px] text-gray-400">{openPipelineCount} teklif</span>
        </div>

        {/* MTD Satış */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e2e8f0] rounded">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Bu Ay</span>
          {mtdRevenue > 0
            ? <span className="text-sm font-black tabular-nums text-pos-text">{fmt(mtdRevenue)}</span>
            : <span className="text-sm font-black text-gray-400">—</span>
          }
          <span className="text-[9px] text-gray-400">{salesMtd.length} satış</span>
        </div>

        {/* Kazanma Oranı */}
        {winRate !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
            winRate >= 60 ? 'bg-pos-light border-pos-light' :
            winRate >= 35 ? 'bg-warn-light border-warn-light'    :
                            'bg-neg-light border-neg-light'
          }`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Kazanma</span>
            <span className={`text-sm font-black tabular-nums ${
              winRate >= 60 ? 'text-pos-text' :
              winRate >= 35 ? 'text-warn-text'   : 'text-neg'
            }`}>
              %{winRate.toFixed(0)}
            </span>
            <span className="text-[9px] text-gray-400">{funnel.converted}/{decided} karar</span>
          </div>
        )}

        {/* Dönüşüm */}
        {conversionRate !== null && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e2e8f0] rounded">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Dönüşüm</span>
            <span className="text-sm font-black tabular-nums text-gray-700">%{conversionRate.toFixed(0)}</span>
            <span className="text-[9px] text-gray-400">{funnel.converted}/{total}</span>
          </div>
        )}

        {/* Link to collections */}
        <Link href="/dashboard/collections"
          className="ml-auto text-[10px] text-primary-600 font-semibold hover:text-primary-700 transition-colors shrink-0">
          Tahsilat →
        </Link>
      </div>

      {/* ── Pipeline Funnel + Stale alert ─────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded">

        {/* Funnel mini-viz */}
        <div className="flex items-center gap-3 flex-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] shrink-0">Huni</span>
          <div className="flex items-end gap-1.5 h-6 flex-1">
            {funnelSteps.map(step => {
              const pct = Math.max(8, (step.count / funnelMax) * 100)
              return (
                <div key={step.label} className="flex flex-col items-center gap-0.5 group relative">
                  <div
                    className={`w-6 ${step.color} rounded-t-sm transition-all`}
                    style={{ height: `${pct}%` }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
                    <div className="bg-gray-900 text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
                      {step.label}: {step.count}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 text-[9px] text-gray-400">
            {funnelSteps.map(s => (
              <span key={s.label} className="tabular-nums">
                {s.count} {s.label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        {/* Rejected signal */}
        {funnel.rejected > 0 && (
          <span className="text-[10px] text-neg font-semibold shrink-0">
            {funnel.rejected} reddedildi
          </span>
        )}
      </div>

      {/* ── Stale proposal alert ──────────────────────────────────────────── */}
      {staleRows.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-warn-light flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-warn-light rounded-full shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-warn-text">
              Yanıt Bekleyen Teklifler — 15+ Gün
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {staleRows.map(p => {
              const age = p.created_at ? daysBetween(p.created_at, today) : 0
              return (
                <div key={p.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-gray-900 truncate block">
                      {p.customer_name ?? '—'}
                    </span>
                    <span className="text-[10px] text-warn-text font-semibold">
                      {age} gündür yanıt yok
                    </span>
                  </div>
                  <div className="text-sm font-black tabular-nums text-warn-text shrink-0">
                    {fmt(Number(p.total ?? 0))}
                    <span className="text-[10px] font-normal text-gray-400 ml-1">{p.currency}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
