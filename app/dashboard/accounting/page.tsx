// ── /dashboard/accounting — Muhasebe (the mali müşavir's home) ────────────────
//
// Refoundation W1 — the Final Form's owner/accountant split made real. The deep
// GL tools (mizan, yevmiye, dönem kapanış, mutabakat, KDV/kurumlar) previously had
// NO nav home — reachable only by burrowing through Finance → CFO tab deep-links.
// This launcher gathers them under one findable accountant home so the müşavir
// never asks "neredeydi bu?", and so the owner's Finance hub can stay owner-first.
//
// Pure launcher (no data fetch) — links to existing, working tool pages. The
// dashboard layout is the single auth gate; nothing here can 500.

import Link from 'next/link'

interface Tool {
  href:  string
  icon:  string
  title: string
  desc:  string
}

interface Group {
  label: string
  tools: Tool[]
}

const GROUPS: Group[] = [
  {
    label: 'Defterler & Kayıtlar',
    tools: [
      { href: '/dashboard/cfo/trial-balance',  icon: '📋', title: 'Mizan',          desc: 'Hesap kodları · borç/alacak bakiyeleri · denge kontrolü' },
      { href: '/dashboard/cfo/journal-entries', icon: '📒', title: 'Yevmiye Defteri', desc: 'Muhasebe fişleri · GL kayıtları · çift taraflı kayıt' },
    ],
  },
  {
    label: 'Dönem & Mutabakat',
    tools: [
      { href: '/dashboard/cfo/period-close',        icon: '🔒', title: 'Dönem Kapanış',   desc: 'Kapanış sihirbazı · kontrol listesi · dönem kilitleme' },
      { href: '/dashboard/cfo/bank-reconciliation', icon: '🏦', title: 'Banka Mutabakatı', desc: 'Banka ekstresi eşleştirme · açık kalemler' },
      { href: '/dashboard/cfo/reconciliation',      icon: '✅', title: 'Mutabakat',        desc: 'Dönem mutabakatı · imza & onay' },
    ],
  },
  {
    label: 'Vergi',
    tools: [
      { href: '/dashboard/cfo/tax/kdv',       icon: '🧾', title: 'KDV',             desc: 'KDV özeti · hesaplanan/indirilecek · beyan dönemleri' },
      { href: '/dashboard/cfo/tax/corporate', icon: '🏛️', title: 'Kurumlar Vergisi', desc: 'Matrah · yıllık tahmin · geçici vergi takvimi' },
    ],
  },
  {
    label: 'Raporlama & Cockpit',
    tools: [
      { href: '/dashboard/accounting/cockpit', icon: '🎛️', title: 'CFO Kokpiti',     desc: 'Muhasebe doğruluğu · çeyreklik · dönem yönetimi' },
      { href: '/dashboard/accounting/reports', icon: '📦', title: 'Raporlama Paketi', desc: 'Aylık CFO paketi · mizan · yönetim paketi · tablolar' },
      { href: '/dashboard/reports',             icon: '📑', title: 'Biçimli Tablolar',   desc: 'Gelir Tablosu · Bilanço · Nakit Akışı · CSV/Excel export' },
    ],
  },
  {
    label: 'Entegrasyonlar',
    tools: [
      { href: '/dashboard/accounting/integrations',   icon: '🔌', title: 'Bağlanabilir Sistemler',   desc: 'Logo · Mikro · Paraşüt · Uyumsoft · Bizim Hesap · banka — fatura/cari/tahsilat okuma (yakında)' },
      { href: '/dashboard/accounting/bank-reconcile',    icon: '🏦', title: 'Banka Ekstresi Mutabakatı', desc: 'Ekstre yükle → Flowra tahsilat/ödemeleriyle otomatik eşleştir (önizleme · kayıt yok)' },
      { href: '/dashboard/accounting/invoice-reconcile', icon: '🧾', title: 'Fatura Mutabakatı',         desc: 'Muhasebe fatura listesi → Flowra satışlarıyla eşleştir, eksik faturaları bul (önizleme)' },
      { href: '/dashboard/accounting/cari-reconcile',    icon: '👥', title: 'Cari Mutabakatı',           desc: 'Muhasebe cari listesi → Flowra müşterileriyle isim bazında eşleştir, eksik carileri bul (önizleme)' },
    ],
  },
]

export const metadata = { title: 'Muhasebe' }

export default function AccountingHubPage() {
  return (
    <div className="flex flex-col gap-6 w-full">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Muhasebe Merkezi</div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">Mali Müşavir Alanı</h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Defterler, dönem kapanış, mutabakat ve resmi raporlama — hepsi tek yerde.
        </p>
      </div>

      {/* ── Tool groups ──────────────────────────────────────────────────────── */}
      {GROUPS.map(group => (
        <section key={group.label} className="flex flex-col gap-2.5">
          <div className="fl-eyebrow text-[#94a3b8]">{group.label}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.tools.map(t => (
              <Link
                key={t.href}
                href={t.href}
                className="fl-card group flex items-start gap-3 px-4 py-3.5 hover:border-brand-subtle transition-colors"
              >
                <span className="text-2xl leading-none mt-0.5 shrink-0">{t.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#0f172a] group-hover:text-brand transition-colors">{t.title}</div>
                  <div className="text-[11px] text-[#64748b] mt-0.5 leading-snug">{t.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

    </div>
  )
}
