// ═══════════════════════════════════════════════════════════════════════════════
// app/dashboard/admin/reconciliation/page.tsx
//
// Ortak Mutabakat Dosyaları — Governance Hub
// Lists all shareholder reconciliation snapshots. Server component.
// ═══════════════════════════════════════════════════════════════════════════════

import Link from 'next/link'
import { createClient }  from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { fmtDate }       from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotListItem {
  id:                  string
  title:               string
  period_label:        string | null
  reconciliation_date: string
  status:              'draft' | 'pending_approval' | 'approved' | 'archived'
  confidence_score:    number | null
  created_at:          string
  created_by:          string
  data_hash:           string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: SnapshotListItem['status']) {
  const map = {
    draft:            { label: 'Taslak',       cls: 'bg-[#f1f5f9] text-[#64748b] border border-[#e8eaef]' },
    pending_approval: { label: 'Onay Bekliyor', cls: 'bg-amber-50 text-amber-700 border border-amber-200'   },
    approved:         { label: 'Onaylandı',    cls: 'bg-green-50 text-green-700 border border-green-200'   },
    archived:         { label: 'Arşiv',        cls: 'bg-[#f8fafc] text-[#94a3b8] border border-[#e8eaef]'  },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function confidenceBadge(score: number | null) {
  if (score === null) return <span className="text-[#94a3b8] text-xs">—</span>
  const cls =
    score >= 80 ? 'text-green-700 bg-green-50 border border-green-200' :
    score >= 60 ? 'text-amber-700 bg-amber-50 border border-amber-200' :
                  'text-red-700 bg-red-50 border border-red-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {score}/100
    </span>
  )
}

// fmtDate imported from @/lib/format

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchSnapshots(): Promise<SnapshotListItem[]> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const companyId = await resolveCompanyId(user.id, supabase)
    if (!companyId) return []

    const { data, error } = await supabase
      .from('reconciliation_snapshots')
      .select(`
        id, company_id, created_by, created_at,
        reconciliation_date, title, period_label, status,
        data_hash, is_immutable, immutable_at,
        confidence_score, approver_count, signoff_count,
        reconciliation_signoffs ( id, partner_name, ownership_pct, status, signed_at )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) return []
    return (data ?? []) as SnapshotListItem[]
  } catch {
    return []
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReconciliationHubPage() {
  const snapshots = await fetchSnapshots()

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e8eaef]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-widest mb-1">
                Yönetim · Kurumsal Kayıtlar
              </p>
              <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
                Ortak Mutabakat Dosyaları
              </h1>
              <p className="text-sm text-[#64748b] mt-1">
                Hissedar onaylı finansal durum kayıtları
              </p>
            </div>
            <Link
              href="/dashboard/admin/reconciliation/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-semibold rounded hover:bg-[#1e293b] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Yeni Mutabakat Oluştur
            </Link>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {snapshots.length === 0 ? (
          /* Empty state */
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-[#f1f5f9] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-[#0f172a] mb-1">Henüz mutabakat dosyası yok</h3>
            <p className="text-sm text-[#64748b] mb-6">
              İlk ortak mutabakat dosyanızı oluşturmak için yukarıdaki butonu kullanın.
            </p>
            <Link
              href="/dashboard/admin/reconciliation/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-semibold rounded hover:bg-[#1e293b] transition-colors"
            >
              Yeni Mutabakat Oluştur
            </Link>
          </div>
        ) : (
          /* Snapshots table */
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between">
              <span className="text-xs font-black text-[#0f172a] uppercase tracking-widest">
                Mutabakat Dosyaları
              </span>
              <span className="text-xs text-[#94a3b8]">{snapshots.length} kayıt</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8eaef]">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                      Başlık
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                      Dönem
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                      Tarih
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                      Durum
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                      Güven
                    </th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                      İşlemler
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap, i) => (
                    <tr
                      key={snap.id}
                      className={`border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors ${
                        i % 2 === 1 ? 'bg-[#fafafa]' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/admin/reconciliation/${snap.id}`}
                          className="font-semibold text-[#0f172a] hover:text-[#334155] transition-colors"
                        >
                          {snap.title}
                        </Link>
                        {snap.data_hash && (
                          <p className="text-[10px] text-[#94a3b8] font-mono mt-0.5">
                            {snap.data_hash.slice(0, 12)}…
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#334155]">
                        {snap.period_label ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-[#64748b] whitespace-nowrap">
                        {fmtDate(snap.reconciliation_date)}
                      </td>
                      <td className="px-5 py-3.5">
                        {statusBadge(snap.status)}
                      </td>
                      <td className="px-5 py-3.5">
                        {confidenceBadge(snap.confidence_score)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/admin/reconciliation/${snap.id}`}
                            className="text-xs font-medium text-[#334155] hover:text-[#0f172a] transition-colors"
                          >
                            Görüntüle
                          </Link>
                          <span className="text-[#e2e8f0]">|</span>
                          <Link
                            href={`/dashboard/admin/reconciliation/${snap.id}/pdf`}
                            className="text-xs font-medium text-[#64748b] hover:text-[#0f172a] transition-colors"
                          >
                            PDF
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
