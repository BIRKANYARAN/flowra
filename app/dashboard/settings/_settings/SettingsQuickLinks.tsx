// Quick-links row — static navigation extracted verbatim from settings/page.tsx.
import Link from 'next/link'

const LINK = 'text-xs font-semibold text-brand-light hover:text-brand px-3 py-2 rounded hover:bg-brand-subtle border border-[#e2e8f0] transition-colors'

export function SettingsQuickLinks() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Link href="/dashboard/settings/alerts" className={LINK}>Uyarı Kuralları →</Link>
      <Link href="/dashboard/settings/email"  className={LINK}>E-posta Bildirimleri →</Link>
      <Link href="/dashboard/settings/setup"  className={LINK}>Kurulum Durumu →</Link>
    </div>
  )
}
