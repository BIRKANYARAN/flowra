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
  create: 'bg-pos-light text-pos-text',
  update: 'bg-info-light text-info-text',
  delete: 'bg-neg-light text-neg-text',
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
      color:    'border-info-light hover:border-info-light',
    },
    {
      href:     '/dashboard/admin/roles',
      title:    'Roller & İzinler',
      subtitle: 'Rol yapılandırması',
      icon:     '🔐',
      color:    'border-primary-100 hover:border-primary-200',
    },
    {
      href:     '/dashboard/admin/workflows',
      title:    'İş Akışı Onayları',
      subtitle: summary.pendingApprovals > 0
        ? `${summary.pendingApprovals} onay bekliyor`
        : 'Bekleyen onay yok',
      icon:     '✅',
      color:    summary.pendingApprovals > 0
        ? 'border-warn-light hover:border-warn'
        : 'border-[#e2e8f0] hover:border-[#e2e8f0]',
      badge:    summary.pendingApprovals > 0 ? summary.pendingApprovals : undefined,
    },
    {
      href:     '/dashboard/admin/audit',
      title:    'Denetim Kaydı',
      subtitle: 'Tüm finansal işlem geçmişi',
      icon:     '📋',
      color:    'border-[#e2e8f0] hover:border-[#e2e8f0]',
    },
    {
      href:     '/dashboard/admin/governance',
      title:    'Ortak Yönetişim',
      subtitle: 'Aylık mutabakat & onay sistemi',
      icon:     '🏛️',
      color:    'border-brand-subtle hover:border-brand-subtle',
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
            className={`relative bg-white border rounded p-4 hover:shadow-sm transition-all group ${tile.color}`}
          >
            {tile.badge != null && (
              <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-warn-light text-white text-[10px] font-black flex items-center justify-center">
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
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Hızlı Ayarlar</div>
        <div className="flex flex-wrap gap-2">
          {SETTING_LINKS.map(s => (
            <Link key={s.href} href={s.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-[#e2e8f0] text-xs font-semibold text-gray-700 hover:border-primary-200 hover:text-primary-700 transition-colors"
            >
              <span>{s.icon}</span>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent audit activity */}
      {summary.recentLogs.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
          <div className="px-4 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Son Aktivite</div>
            <Link href="/dashboard/admin/audit"
              className="text-[10px] font-semibold text-primary-600 hover:underline"
            >
              Tümünü Gör →
            </Link>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
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
