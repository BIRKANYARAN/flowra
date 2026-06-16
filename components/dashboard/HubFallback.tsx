// ── HubFallback — one shared auth/company load-failure state for every hub ─────
//
// Server-safe (no 'use client'); renders the client <Icon> inside. Replaces the
// per-hub ad-hoc fallbacks (some with a giant ⚠️ emoji, some bare) so every hub
// fails in one calm, premium visual language. eyebrow=area, one icon-tile, one
// retry affordance.

import { Icon } from '@/components/ui/Icon'

export function HubFallback({
  variant,
  retryHref,
}: {
  variant: 'auth' | 'company'
  retryHref: string
}) {
  const message =
    variant === 'auth'
      ? 'Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.'
      : 'Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.'
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-[#f8fafc] border border-[#edeef2] flex items-center justify-center text-[#94a3b8]">
        <Icon name="refresh" size={22} strokeWidth={1.75} />
      </div>
      <p className="text-sm text-[#64748b]">{message}</p>
      <a href={retryHref} className="text-sm text-brand-light font-semibold hover:underline">
        Yeniden Dene
      </a>
    </div>
  )
}
