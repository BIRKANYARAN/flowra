// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/admin/page.tsx — Yönetim Merkezi (Admin Hub)
//
// Server component. Admin layout already enforces role guard.
// Fetches summary counts for quick-glance cards, then shows nav tiles.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchSummary(companyId: string) {
  const supabase = createClient()

  const [membersRes, workflowRes, auditRes] = await Promise.allSettled([
    supabase
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('accepted_at', 'is', null),

    supabase
      .from('workflow_instances')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'pending'),

    supabase
      .from('audit_logs')
      .select('id, action, entity_type, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return {
    memberCount:    membersRes.status === 'fulfilled' ? (membersRes.value.count ?? 0) : 0,
    pendingApprovals: workflowRes.status === 'fulfilled' ? (workflowRes.value.count ?? 0) : 0,
    recentLogs:     auditRes.status === 'fulfilled' ? (auditRes.value.data ?? []) : [],
  }
}

// ── Action color map ──────────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
}

function fmtRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1)  return 'az önce'
    if (mins < 60) return `${mins}d önce`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}sa önce`
    const days = Math.floor(hrs / 24)
    return `${days}g önce`
  } catch {
    return ''
  }
}

// ── Nav tile definition ───────────────────────────────────────────────────────

interface AdminTile {
  href:     string
  title:    string
  subtitle: string
  icon:     string
  color:    string
  badge?:   number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminHubPage() {
  const supabase = createClient()
  let companyId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user) companyId = await resolveCompanyId(data.user.id, supabase)
  } catch { /* non-fatal — admin layout already validated */ }

  const summary = companyId
    ? await fetchSummary(companyId)
    : { memberCount: 0, pendingApprovals: 0, recentLogs: [] }

  const TILES: AdminTile[] = [
    {
      href:     '/dashboard/admin/users',
      title:    'Kullanıcılar',
      subtitle: `${summary.memberCount} aktif üye`,
      icon:     '👥',
      color:    'border-blue-100 hover:border-blue-200',
    },
    {
      href:     '/dashboard/admin/roles',
      title:    'Roller & İzinler',
      subtitle: 'Rol yapılandırması',
      icon:     '🔐',
      color:    'border-violet-100 hover:border-violet-200',
    },
    {
      href:     '/dashboard/admin/workflows',
      title:    'İş Akışı Onayları',
      subtitle: summary.pendingApprovals > 0
        ? `${summary.pendingApprovals} onay bekliyor`
        : 'Bekleyen onay yok',
      icon:     '✅',
      color:    summary.pendingApprovals > 0
        ? 'border-amber-200 hover:border-amber-300'
        : 'border-gray-100 hover:border-gray-200',
      badge:    summary.pendingApprovals > 0 ? summary.pendingApprovals : undefined,
    },
    {
      href:     '/dashboard/admin/audit',
      title:    'Denetim Kaydı',
      subtitle: 'Tüm finansal işlem geçmişi',
      icon:     '📋',
      color:    'border-gray-100 hover:border-gray-200',
    },
  ]

  const SETTING_LINKS = [
    { href: '/dashboard/settings',        label: 'Genel Ayarlar',      icon: '⚙️' },
    { href: '/dashboard/settings/alerts', label: 'Uyarı Eşikleri',     icon: '🔔' },
    { href: '/dashboard/backups',         label: 'Yedekleme',           icon: '💾' },
  ]

  const ACTION_LABELS: Record<string, string> = {
    create: 'Oluşturuldu',
    update: 'Güncellendi',
    delete: 'Silindi',
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Yönetim Merkezi</h1>
        <p className="text-xs text-gray-400 mt-0.5">Kullanıcılar, roller, onaylar ve denetim</p>
      </div>

      {/* Main tiles */}
      <div className="grid grid-cols-2 gap-4">
        {TILES.map(tile => (
          <Link key={tile.href} href={tile.href}
            className={`relative bg-white border rounded-xl p-4 hover:shadow-sm transition-all group ${tile.color}`}
          >
            {tile.badge != null && (
              <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                {tile.badge}
              </span>
            )}
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{tile.icon}</span>
              <div className="min-w-0">
                <div className="font-bold text-sm text-gray-900 group-hover:text-primary-700 transition-colors">
                  {tile.title}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{tile.subtitle}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-primary-600">
              Git <span className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Settings quick-links */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Hızlı Ayarlar</div>
        <div className="flex flex-wrap gap-2">
          {SETTING_LINKS.map(s => (
            <Link key={s.href} href={s.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-primary-200 hover:text-primary-700 transition-colors"
            >
              <span>{s.icon}</span>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent audit activity */}
      {summary.recentLogs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Son Aktivite</div>
            <Link href="/dashboard/admin/audit"
              className="text-[10px] font-semibold text-primary-600 hover:underline"
            >
              Tümünü Gör →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(summary.recentLogs as Array<{ id: string; action: string; entity_type: string; created_at: string }>).map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${ACTION_STYLE[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="text-xs text-gray-600 truncate">{log.entity_type}</span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0 ml-2">{fmtRelative(log.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick nav */}
      <div className="text-xs text-gray-400 flex items-center gap-4">
        <Link href="/dashboard" className="hover:text-primary-600 font-semibold">← Komuta</Link>
        <Link href="/dashboard/admin/users" className="hover:text-primary-600">Kullanıcılar</Link>
        <Link href="/dashboard/admin/workflows" className="hover:text-primary-600">Onaylar</Link>
        <Link href="/dashboard/admin/audit" className="hover:text-primary-600">Denetim</Link>
      </div>

    </div>
  )
}
