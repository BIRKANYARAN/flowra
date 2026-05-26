// ── KDV Özeti (KDV Beyanname Özeti) ──────────────────────────────────────────
// /dashboard/cfo/tax/kdv
//
// Server component — fetches real KDV summary from TaxService.computeKDVSummary().
// Period defaults to current calendar month; can be overridden via searchParams.
//
// Turkish KDV rules:
//   Hesaplanan KDV (391) — output VAT from sales
//   İndirilecek KDV (191) — input VAT from expenses
//   Net KDV = output − input  (positive = ödenecek; negative = sonraki döneme devir)
//   Beyanname son tarihi: ayı izleyen ayın 26'sı

export const dynamic = 'force-dynamic'

import Link             from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import {
  TaxService,
  type KDVSummary,
} from '@/lib/services/tax.service'
import { periodForMonth } from '@/lib/services/finance-rules'
import { fmtTRY as fmt } from '@/lib/format'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                   'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  return `${day} ${months[Number(m) - 1]} ${y}`
}

// ── Error / empty states ──────────────────────────────────────────────────────

function ErrorState({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">{label}</p>
      <a href={href} className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function KdvPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string }
}) {
  const supabase = createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!userId) return <ErrorState href="/dashboard/cfo/tax/kdv" label="Oturum bilgisi alınamadı." />

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <ErrorState href="/dashboard/cfo/tax/kdv" label="Şirket bilgisi yüklenemedi." />

  // ── Period ────────────────────────────────────────────────────────────────
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const defaultPeriod = periodForMonth(currentYM)
  const from = searchParams?.from ?? defaultPeriod.from
  const to   = searchParams?.to   ?? defaultPeriod.to

  // ── Fetch KDV summary ─────────────────────────────────────────────────────
  let kdv: KDVSummary | null = null
  let fetchError: string | null = null
  try {
    kdv = await TaxService.computeKDVSummary(companyId, from, to, supabase)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'KDV verileri yüklenemedi'
  }

  // ── Empty period ──────────────────────────────────────────────────────────
  if (!kdv) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">KDV Özeti</h1>
            <p className="text-xs text-[#94a3b8] mt-0.5">Hesaplanan KDV − İndirilecek KDV = Net KDV</p>
          </div>
          <Link href="/dashboard/finance?tab=cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">← CFO Cockpit</Link>
        </div>
        {fetchError && (
          <div className="bg-neg-light border border-neg rounded px-4 py-3 text-sm text-neg-text">
            {fetchError}
          </div>
        )}
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-8 text-center">
          <p className="text-sm text-[#94a3b8]">Aktif dönem bulunamadı</p>
          <p className="text-xs text-[#cbd5e1] mt-1">{from} — {to}</p>
        </div>
      </div>
    )
  }

  const isPayable = kdv.vat_payable

  return (
    <div className="flex flex-col gap-4 max-w-2xl print:max-w-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">KDV Özeti</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {kdv.period_label} · Hesaplanan KDV − İndirilecek KDV = Net KDV
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/cfo/tax/kdv" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">Yenile</Link>
          <Link href="/dashboard/finance?tab=cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">← CFO Cockpit</Link>
        </div>
      </div>

      {/* ── Print header ───────────────────────────────────────────────────── */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-black">KDV Beyan Özeti</h1>
        <p className="text-sm text-[#64748b]">{from} — {to}</p>
      </div>

      {/* ── Beyan tarihi banner ────────────────────────────────────────────── */}
      <div className={`rounded px-4 py-2.5 border text-xs flex items-center justify-between ${
        isPayable
          ? 'bg-warn-light border-warn/20 text-warn-text'
          : 'bg-pos-light border-pos-light text-pos-text'
      }`}>
        <span>
          <span className="font-black">Beyan tarihi: </span>
          {fmtDate(kdv.filing_due_date)}
        </span>
        <span className={`font-black text-sm ${isPayable ? 'text-warn-text' : 'text-pos-text'}`}>
          {isPayable ? 'Ödenecek' : 'İade / Devir'}
        </span>
      </div>

      {/* ── Main KDV card ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">

        {/* Output VAT */}
        <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesaplanan KDV (Çıkış) — 391</div>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#64748b]">Satış KDV (Hesaplanan)</span>
            <span className="tabular-nums text-sm font-black text-warn">{fmt(kdv.output_vat_try)}</span>
          </div>
        </div>

        {/* Input VAT */}
        <div className="px-4 py-2.5 bg-[#f8fafc] border-y border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">İndirilecek KDV (Giriş) — 191</div>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#64748b]">Gider KDV (İndirilecek)</span>
            <span className="tabular-nums text-sm font-semibold text-pos-text">−{fmt(kdv.input_vat_try)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[#e2e8f0] pt-1.5">
            <span className="text-xs font-semibold text-[#334155]">Toplam İndirilecek KDV</span>
            <span className="tabular-nums text-sm font-black text-pos-text">
              {fmt(kdv.input_vat_try)}
            </span>
          </div>
        </div>

        {/* Net KDV */}
        <div className={`px-4 py-4 border-t-2 ${isPayable ? 'bg-warn-light border-warn/20' : 'bg-pos-light border-pos-light'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-[#0f172a]">Net KDV</div>
              <div className={`text-[10px] font-semibold mt-0.5 ${isPayable ? 'text-warn' : 'text-pos-text'}`}>
                {isPayable ? '⬆ Ödenecek (beyan döneminde)' : '⬇ Sonraki döneme devir'}
              </div>
            </div>
            <div className={`text-2xl font-black tabular-nums ${isPayable ? 'text-warn-text' : 'text-pos-text'}`}>
              {fmt(Math.abs(kdv.net_vat_try))}
            </div>
          </div>
        </div>
      </div>

      {/* ── VAT Rate Breakdown ─────────────────────────────────────────────── */}
      {kdv.breakdown.vat_rate_summary.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">KDV Oranı Dağılımı</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Oran</th>
                <th className="text-right px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Matrah</th>
                <th className="text-right px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">KDV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {kdv.breakdown.vat_rate_summary.map(row => (
                <tr key={row.rate} className="hover:bg-[#f8fafc]/60">
                  <td className="px-4 py-2.5 font-semibold text-[#1e293b]">%{row.rate}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#334155]">{fmt(row.base_try)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-warn-text">{fmt(row.vat_try)}</td>
                </tr>
              ))}
              <tr className="bg-[#f8fafc] font-black border-t border-[#e2e8f0]">
                <td className="px-4 py-2.5 text-[#334155]">Toplam</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#0f172a]">
                  {fmt(kdv.breakdown.vat_rate_summary.reduce((s, r) => s + r.base_try, 0))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-warn-text">
                  {fmt(kdv.output_vat_try)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Formula summary ────────────────────────────────────────────────── */}
      <div className="bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text leading-relaxed">
        <span className="font-bold">KDV Formülü:</span>{' '}
        Hesaplanan KDV ({fmt(kdv.output_vat_try)}) − İndirilecek KDV ({fmt(kdv.input_vat_try)}) ={' '}
        <span className="font-black">{fmt(Math.abs(kdv.net_vat_try))} {isPayable ? 'Ödenecek' : 'Devir'}</span>
        {' '}· Beyan: {fmtDate(kdv.filing_due_date)}
      </div>

      {/* ── Cross-navigation ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          KDV beyanı kurumlar vergisi ve satışlarla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/cfo/tax/corporate" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Kurumlar Vergisi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/operations?tab=expenses" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Giderler →
          </Link>
        </div>
      </div>
    </div>
  )
}
