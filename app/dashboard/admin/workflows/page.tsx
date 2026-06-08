// /dashboard/admin/workflows — Pending Workflow Approvals (Server Component)
// Admin-only page. Fetches pending workflows via direct Supabase query.

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import WorkflowActions      from './workflow-actions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowRow {
  id:            string
  workflow_type: string
  status:        string
  initiator_id:  string
  initiated_at:  string
  expires_at:    string | null
  payload:       Record<string, unknown>
  notes:         string | null
}

// ── Labels ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  expense_approval:     'Masraf Onayı',
  partner_loan_entry:   'Ortak Borç Girişi',
  dividend_declaration: 'Temettü Beyanı',
  period_close:         'Dönem Kapanışı',
  period_lock:          'Dönem Kilitleme',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
    })
  } catch { return iso }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WorkflowsPage() {
  const supabase  = createClient()
  let companyId: string | null = null

  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user) companyId = await resolveCompanyId(data.user.id, supabase)
  } catch { /* non-fatal */ }

  // Fetch pending workflows
  let workflows: WorkflowRow[] = []
  let tableError = false

  if (companyId) {
    try {
      const { data, error } = await supabase
        .from('workflow_instances')
        .select('id, workflow_type, status, initiator_id, initiated_at, expires_at, payload, notes')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('initiated_at', { ascending: false })

      if (error) {
        // Table doesn't exist yet
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          tableError = true
        } else {
          console.error('[workflows page]', error)
        }
      } else {
        workflows = (data ?? []) as WorkflowRow[]
      }
    } catch { tableError = true }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (tableError) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Onay Bekleyen İşlemler</h1>
          </div>
          <Link href="/dashboard/admin" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
            ← Yönetim
          </Link>
        </div>
        <div className="bg-warn-light border border-warn-light rounded px-4 py-6 text-center">
          <div className="text-sm font-semibold text-warn-text mb-1">Workflow sistemi kurulum bekliyor</div>
          <div className="text-xs text-[#64748b]">
            workflow_instances tablosu henüz oluşturulmamış. Veritabanı migrasyonunu çalıştırın.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Onay Bekleyen İşlemler</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {workflows.length} işlem onay bekliyor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/admin/workflows" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
            ↺ Yenile
          </Link>
          <Link href="/dashboard/admin" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
            ← Yönetim
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {workflows.length === 0 && (
        <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-12 text-center">
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm font-semibold text-[#64748b]">Bekleyen iş akışı yok</div>
          <div className="text-xs text-[#94a3b8] mt-1">
            Tüm işlemler onaylandı veya henüz onay gerektiren işlem oluşturulmadı.
          </div>
        </div>
      )}

      {/* Workflow table */}
      {workflows.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#e8eaef] bg-[#f8fafc]">
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Tür
                </th>
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Başlatan
                </th>
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Başlatıldı
                </th>
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Son Tarih
                </th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {workflows.map(w => (
                <tr key={w.id} className="hover:bg-[#f8fafc]/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-[0.65rem] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-warn-light text-warn-text">
                      {TYPE_LABELS[w.workflow_type] ?? w.workflow_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#64748b]">
                    {w.initiator_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-[#64748b]">
                    {fmtDate(w.initiated_at)}
                  </td>
                  <td className="px-4 py-3 text-[#94a3b8]">
                    {w.expires_at ? fmtDate(w.expires_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <WorkflowActions workflowId={w.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Onay bekleyen işlemler denetim izinde kayıt altına alınır.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/admin/audit"
            className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap"
          >
            Denetim İzi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link
            href="/dashboard/operations?tab=expenses"
            className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap"
          >
            Giderler →
          </Link>
        </div>
      </div>
    </div>
  )
}
