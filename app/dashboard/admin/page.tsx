// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/admin/page.tsx — Yönetim Merkezi (Admin Hub)
//
// Server component. Admin layout already enforces role guard.
// Tab-based hub: users / roles / workflows / audit / reconciliation
// URL: /dashboard/admin?tab=users (default)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { getGlMode }        from '@/lib/middleware/period-guard'
import { fmtDate, fmtRelative } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'users' | 'roles' | 'workflows' | 'audit' | 'reconciliation'

interface CompanyMemberRow {
  id:          string
  user_id:     string
  role:        string
  accepted_at: string | null
  invited_at:  string | null
}

interface WorkflowRow {
  id:            string
  workflow_type: string
  status:        string
  initiator_id:  string
  initiated_at:  string
  expires_at:    string | null
  payload:       Record<string, unknown>
  resource_type: string | null
  resource_id:   string | null
}

interface AuditRow {
  id:          string
  action:      string
  entity_type: string
  user_id:     string
  created_at:  string
}

interface ReconciliationRow {
  id:                  string
  title:               string
  period_label:        string | null
  reconciliation_date: string
  status:              'draft' | 'pending_approval' | 'approved' | 'archived'
  confidence_score:    number | null
  created_at:          string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin:   'Yönetici',
  manager: 'Satış Temsilcisi',
  viewer:  'İzleyici',
}

const ROLE_BADGE: Record<string, string> = {
  admin:   'bg-brand-subtle text-brand',
  manager: 'bg-info-light text-info-text',
  viewer:  'bg-[#f1f5f9] text-[#64748b]',
}

const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  expense_approval:     'Masraf Onayı',
  partner_loan:         'Ortak Borç',
  dividend_declaration: 'Temettü Beyanı',
  period_close:         'Dönem Kapanış',
}

const ACTION_STYLE: Record<string, string> = {
  create: 'bg-pos-light text-pos-text',
  update: 'bg-info-light text-info-text',
  delete: 'bg-neg-light text-neg-text',
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Oluşturuldu',
  update: 'Güncellendi',
  delete: 'Silindi',
}

const RECON_STATUS_MAP = {
  draft:            { label: 'Taslak',       cls: 'bg-[#f1f5f9] text-[#64748b]' },
  pending_approval: { label: 'Onay Bekliyor', cls: 'bg-amber-50 text-amber-700'  },
  approved:         { label: 'Onaylandı',    cls: 'bg-green-50 text-green-700'   },
  archived:         { label: 'Arşiv',        cls: 'bg-[#f8fafc] text-[#94a3b8]'  },
} as const

// fmtDate and fmtRelative are imported from @/lib/format

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchMembers(supabase: ReturnType<typeof createClient>, companyId: string): Promise<CompanyMemberRow[]> {
  try {
    const { data } = await supabase
      .from('company_members')
      .select('id, user_id, role, accepted_at, invited_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('accepted_at', { ascending: false })
      .limit(20)
    return (data ?? []) as CompanyMemberRow[]
  } catch { return [] }
}

async function fetchWorkflows(supabase: ReturnType<typeof createClient>, companyId: string): Promise<WorkflowRow[]> {
  try {
    const { data } = await supabase
      .from('workflow_instances')
      .select('id, workflow_type, status, initiator_id, initiated_at, expires_at, payload, resource_type, resource_id')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('initiated_at', { ascending: false })
      .limit(10)
    return (data ?? []) as WorkflowRow[]
  } catch { return [] }
}

async function fetchAuditLogs(supabase: ReturnType<typeof createClient>, companyId: string): Promise<AuditRow[]> {
  try {
    const { data } = await supabase
      .from('audit_logs')
      .select('id, action, entity_type, user_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10)
    return (data ?? []) as AuditRow[]
  } catch { return [] }
}

async function fetchReconciliations(supabase: ReturnType<typeof createClient>, companyId: string): Promise<ReconciliationRow[]> {
  try {
    const { data } = await supabase
      .from('reconciliation_snapshots')
      .select('id, title, period_label, reconciliation_date, status, confidence_score, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10)
    return (data ?? []) as ReconciliationRow[]
  } catch { return [] }
}

// ── Tab nav ───────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'users',          label: 'Kullanıcılar' },
  { key: 'roles',          label: 'Roller'       },
  { key: 'workflows',      label: 'Onaylar'      },
  { key: 'audit',          label: 'Denetim'      },
  { key: 'reconciliation', label: 'Mutabakatlar' },
]

// ── Tab panels ────────────────────────────────────────────────────────────────

function UsersTab({ members }: { members: CompanyMemberRow[] }) {
  const active  = members.filter(m => m.accepted_at !== null)
  const pending = members.filter(m => m.accepted_at === null)
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
          {active.length} aktif üye{pending.length > 0 ? ` · ${pending.length} bekleyen` : ''}
        </div>
        <Link href="/dashboard/admin/users"
          className="text-xs font-semibold text-brand-light hover:text-brand">
          Davet Et / Yönet →
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="px-4 pb-8 text-center text-sm text-[#94a3b8]">Üye bulunamadı.</div>
      ) : (
        <div className="divide-y divide-[#f1f5f9]">
          {active.map(m => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded bg-brand-subtle flex items-center justify-center flex-shrink-0">
                  <span className="text-brand font-bold text-[10px]">
                    {(ROLE_LABEL[m.role] ?? m.role).slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] truncate font-mono">
                    {m.user_id.slice(0, 16)}…
                  </div>
                  {m.accepted_at && (
                    <div className="text-[10px] text-[#94a3b8]">Katıldı: {fmtDate(m.accepted_at)}</div>
                  )}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${ROLE_BADGE[m.role] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </div>
          ))}
          {pending.map(m => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 opacity-70">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded bg-warn-light flex items-center justify-center flex-shrink-0">
                  <span className="text-warn-text font-bold text-[10px]">?</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#64748b] truncate font-mono">
                    {m.user_id.slice(0, 16)}…
                  </div>
                  <div className="text-[10px] text-warn-text">Davet bekleniyor</div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${ROLE_BADGE[m.role] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-4">
        <Link href="/dashboard/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-brand-light font-semibold hover:text-brand">
          Ekip Yönetimi sayfasını aç →
        </Link>
      </div>
    </div>
  )
}

function RolesTab() {
  const ROLES = [
    {
      key:   'admin',
      label: 'Yönetici',
      badge: ROLE_BADGE.admin,
      perms: [
        'Tüm kayıtlara tam okuma/yazma erişimi',
        'Ekip üyesi davet etme ve rol değiştirme',
        'İş akışı onaylama/reddetme yetkisi',
        'Şirket ayarlarını yönetme',
        'Mutabakat dosyası oluşturma',
      ],
    },
    {
      key:   'manager',
      label: 'Satış Temsilcisi',
      badge: ROLE_BADGE.manager,
      perms: [
        'Müşteri ve satış kayıtlarını yönetme',
        'Proforma ve teklif oluşturma',
        'Stok hareketlerini görüntüleme',
        'Kendi masraf onay taleplerini oluşturma',
        'Yönetim ve finans panellerine erişim yok',
      ],
    },
    {
      key:   'viewer',
      label: 'İzleyici',
      badge: ROLE_BADGE.viewer,
      perms: [
        'Tüm kayıtları salt okunur görüntüleme',
        'Rapor ve dashboard görüntüleme',
        'Herhangi bir kayıt oluşturma/düzenleme yok',
        'Yönetim paneline erişim yok',
      ],
    },
  ]

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">3 Rol Tanımı</div>
        <Link href="/dashboard/admin/roles"
          className="text-xs font-semibold text-brand-light hover:text-brand">
          Roller Yönet →
        </Link>
      </div>
      <div className="space-y-3">
        {ROLES.map(r => (
          <div key={r.key} className="bg-[#f8fafc] border border-[#e2e8f0] rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.badge}`}>{r.label}</span>
            </div>
            <ul className="space-y-1">
              {r.perms.map((p, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[#64748b]">
                  <span className="text-[#94a3b8] mt-px">·</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowsTab({ workflows }: { workflows: WorkflowRow[] }) {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
          {workflows.length} onay bekliyor
        </div>
        <Link href="/dashboard/admin/workflows"
          className="text-xs font-semibold text-brand-light hover:text-brand">
          Tümü →
        </Link>
      </div>

      {workflows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="text-xl mb-1.5">✓</div>
          <div className="text-sm font-semibold text-[#64748b]">Onay bekleyen işlem yok</div>
          <div className="text-xs text-[#94a3b8] mt-1">Tüm işlemler onaylandı.</div>
        </div>
      ) : (
        <div className="divide-y divide-[#f1f5f9]">
          {workflows.map(w => {
            const payload = w.payload ?? {}
            return (
              <div key={w.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-warn-light text-warn-text">
                        {WORKFLOW_TYPE_LABELS[w.workflow_type] ?? w.workflow_type}
                      </span>
                      {w.expires_at && (
                        <span className="text-[10px] text-[#94a3b8]">Son: {fmtDate(w.expires_at)}</span>
                      )}
                    </div>
                    {w.workflow_type === 'expense_approval' && (
                      <div className="text-xs text-[#64748b] truncate">
                        {String(payload.description ?? '—')} · {String(payload.category ?? '')}
                      </div>
                    )}
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">{fmtRelative(w.initiated_at)}</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {/* Approve/reject require client JS — link to full page */}
                    <Link
                      href={`/dashboard/admin/workflows`}
                      className="text-[10px] font-bold px-2.5 py-1.5 rounded bg-pos text-white hover:bg-pos transition-colors"
                    >
                      Onayla
                    </Link>
                    <Link
                      href={`/dashboard/admin/workflows`}
                      className="text-[10px] font-bold px-2.5 py-1.5 rounded bg-neg-light text-neg border border-neg-light hover:bg-neg-light transition-colors"
                    >
                      Reddet
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="px-4 py-3 border-t border-[#f1f5f9]">
        <Link href="/dashboard/admin/workflows"
          className="text-xs text-brand-light font-semibold hover:text-brand">
          Onay ekranını aç (işlem yapmak için) →
        </Link>
      </div>
    </div>
  )
}

function AuditTab({ logs }: { logs: AuditRow[] }) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Son 10 kayıt</div>
        <Link href="/dashboard/admin/audit"
          className="text-xs font-semibold text-brand-light hover:text-brand">
          Tümü →
        </Link>
      </div>

      {logs.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[#94a3b8]">Henüz denetim kaydı yok.</div>
      ) : (
        <div className="divide-y divide-[#f1f5f9]">
          {logs.map(log => (
            <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${ACTION_STYLE[log.action] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
                  {ACTION_LABEL[log.action] ?? log.action}
                </span>
                <span className="text-xs text-[#64748b] truncate">{log.entity_type}</span>
                <code className="text-[10px] text-[#94a3b8] shrink-0 hidden sm:inline">
                  {log.user_id.slice(0, 8)}…
                </code>
              </div>
              <span className="text-[10px] text-[#94a3b8] shrink-0 ml-2">{fmtRelative(log.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-[#f1f5f9]">
        <Link href="/dashboard/admin/audit"
          className="text-xs text-brand-light font-semibold hover:text-brand">
          Denetim kaydının tamamını görüntüle →
        </Link>
      </div>
    </div>
  )
}

function ReconciliationTab({ snapshots }: { snapshots: ReconciliationRow[] }) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
          {snapshots.length} mutabakat dosyası
        </div>
        <Link href="/dashboard/admin/reconciliation/new"
          className="text-xs font-semibold text-brand-light hover:text-brand">
          + Yeni Oluştur
        </Link>
      </div>

      {snapshots.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="text-sm font-semibold text-[#64748b] mb-1">Henüz mutabakat dosyası yok</div>
          <Link href="/dashboard/admin/reconciliation/new"
            className="text-xs text-brand-light font-semibold hover:text-brand">
            İlk dosyayı oluştur →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[#f1f5f9]">
          {snapshots.map(snap => {
            const statusMeta = RECON_STATUS_MAP[snap.status] ?? RECON_STATUS_MAP.draft
            const score = snap.confidence_score
            const scoreCls =
              score === null         ? 'text-[#94a3b8]' :
              score >= 80            ? 'text-green-700 bg-green-50' :
              score >= 60            ? 'text-amber-700 bg-amber-50' :
                                       'text-red-700 bg-red-50'
            return (
              <Link
                key={snap.id}
                href={`/dashboard/admin/reconciliation/${snap.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc] transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#0f172a] truncate group-hover:text-brand-light transition-colors">
                    {snap.title}
                  </div>
                  <div className="text-[10px] text-[#94a3b8] mt-0.5">
                    {snap.period_label ?? fmtDate(snap.reconciliation_date)} · {fmtDate(snap.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {score !== null && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreCls}`}>
                      {score}/100
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusMeta.cls}`}>
                    {statusMeta.label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="px-4 py-3 border-t border-[#f1f5f9]">
        <Link href="/dashboard/admin/reconciliation"
          className="text-xs text-brand-light font-semibold hover:text-brand">
          Tüm mutabakat dosyaları →
        </Link>
      </div>
    </div>
  )
}

// ── GL Modu Section ───────────────────────────────────────────────────────────

const GL_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  shadow:     { label: 'Shadow (Pasif)',     cls: 'bg-[#f1f5f9] text-[#64748b]'  },
  parallel:   { label: 'Paralel (İzleme)',   cls: 'bg-amber-50 text-amber-700'    },
  gl_primary: { label: 'GL Birincil (Aktif)', cls: 'bg-green-50 text-green-700'   },
}

const GL_MODE_UPGRADE: Record<string, { next: string; label: string } | null> = {
  shadow:     { next: 'parallel',   label: 'Paralel Moda Geç'    },
  parallel:   { next: 'gl_primary', label: 'GL Birincil Moda Geç' },
  gl_primary: null,
}

function GlModeSection({ glMode }: { glMode: 'shadow' | 'parallel' | 'gl_primary' }) {
  const badge   = GL_MODE_BADGE[glMode]   ?? GL_MODE_BADGE.shadow
  const upgrade = GL_MODE_UPGRADE[glMode] ?? null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">GL Modu</div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      <p className="text-xs text-[#64748b] mb-4">
        GL modu, satış/gider/alış kayıtlarının muhasebe defterine (journal_entries) ne zaman
        yazıldığını belirler. Shadow: hiç yazılmaz. Paralel: asenkron yazılır. GL Birincil: senkron.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {upgrade && (
          <Link
            href={`/dashboard/admin/gl-mode?upgrade=${upgrade.next}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition-colors"
          >
            {upgrade.label} →
          </Link>
        )}
        <Link
          href="/api/admin/gl-divergence"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-[#e2e8f0] text-xs font-semibold text-[#334155] hover:text-brand transition-colors"
        >
          GL Sapma Raporu (JSON) ↗
        </Link>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params  = await searchParams
  const rawTab  = typeof params.tab === 'string' ? params.tab : 'users'
  const tab     = (TABS.some(t => t.key === rawTab) ? rawTab : 'users') as Tab

  const supabase  = createClient()
  let companyId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user) companyId = await resolveCompanyId(data.user.id, supabase)
  } catch { /* non-fatal — admin layout already validated */ }

  // Fetch gl_mode server-side (always, for the GL Modu section)
  let glMode: 'shadow' | 'parallel' | 'gl_primary' = 'shadow'
  if (companyId) {
    try { glMode = await getGlMode(companyId, supabase) } catch { /* non-fatal */ }
  }

  // Fetch only the data needed for the active tab
  const [members, workflows, auditLogs, reconciliations] = await Promise.all([
    companyId && (tab === 'users' || tab === 'roles')
      ? fetchMembers(supabase, companyId)
      : Promise.resolve([] as CompanyMemberRow[]),
    companyId && tab === 'workflows'
      ? fetchWorkflows(supabase, companyId)
      : Promise.resolve([] as WorkflowRow[]),
    companyId && tab === 'audit'
      ? fetchAuditLogs(supabase, companyId)
      : Promise.resolve([] as AuditRow[]),
    companyId && tab === 'reconciliation'
      ? fetchReconciliations(supabase, companyId)
      : Promise.resolve([] as ReconciliationRow[]),
  ])

  return (
    <div className="flex flex-col gap-6 max-w-3xl">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Yönetim Merkezi</h1>
        <p className="text-xs text-[#94a3b8] mt-0.5">Kullanıcılar, roller, onaylar ve denetim</p>
      </div>

      {/* Tab hub container */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* Tab pill nav */}
        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 flex items-center gap-1 flex-wrap">
          {TABS.map(t => (
            <Link
              key={t.key}
              href={`/dashboard/admin?tab=${t.key}`}
              className={
                tab === t.key
                  ? 'px-3 py-1.5 rounded text-xs font-semibold bg-white text-[#0f172a] shadow-sm'
                  : 'px-3 py-1.5 rounded text-xs text-[#64748b] hover:text-[#334155] transition-colors'
              }
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'users'          && <UsersTab          members={members}            />}
        {tab === 'roles'          && <RolesTab                                        />}
        {tab === 'workflows'      && <WorkflowsTab      workflows={workflows}         />}
        {tab === 'audit'          && <AuditTab          logs={auditLogs}              />}
        {tab === 'reconciliation' && <ReconciliationTab snapshots={reconciliations}   />}
      </div>

      {/* Quick settings links */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded p-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Hızlı Ayarlar</div>
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/dashboard/settings',        label: 'Genel Ayarlar'  },
            { href: '/dashboard/settings/alerts', label: 'Uyarı Eşikleri' },
            { href: '/dashboard/reports',         label: 'Raporlar'        },
          ].map(s => (
            <Link key={s.href} href={s.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-[#e2e8f0] text-xs font-semibold text-[#334155] hover:text-brand transition-colors"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* GL Modu */}
      <GlModeSection glMode={glMode} />

      {/* Back link */}
      <div className="text-xs text-[#94a3b8]">
        <Link href="/dashboard" className="hover:text-brand-light font-semibold">← Komuta Merkezi</Link>
      </div>

    </div>
  )
}
