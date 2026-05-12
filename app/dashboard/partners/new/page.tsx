// ── /dashboard/partners/new — Yeni Ortak (server component) ──────────────────
//
// FAZ 16: Converted from 'use client' to server component.
//
// This page has no server-side data to prefetch — it is a form-only page.
// The breadcrumb, title, and info panel are server-rendered (static HTML, no JS).
//
// Client island:
//   NewPartnerClient — form state, validation, two-step API submission

import Link            from 'next/link'
import NewPartnerClient from './NewPartnerClient'

export default function NewPartnerPage() {
  return (
    <div className="max-w-lg space-y-6">

      {/* ── Breadcrumb / header ────────────────────────────────────────── */}
      <div>
        <Link
          href="/dashboard/partners"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1 mb-3"
        >
          ← Ortaklar
        </Link>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Yeni Ortak</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Şirkete yeni bir ortak ekleyin
        </p>
      </div>

      {/* ── Info panel (server-rendered — no JS) ──────────────────────── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1.5">
        <div className="font-bold text-blue-800 mb-1">Ortak nasıl eklenir?</div>
        <div>
          <span className="font-semibold">Pay Oranı:</span>{' '}
          Ortağın şirketteki hisse oranı. İki eşit ortak için her birine %50 girin.
        </div>
        <div>
          <span className="font-semibold">Başlangıç Sermayesi:</span>{' '}
          Opsiyonel. Girilirse &quot;Borç Girişi&quot; işlemi olarak kaydedilir ve bakiyeye yansır.
        </div>
      </div>

      {/* ── Client island: the form ────────────────────────────────────── */}
      <NewPartnerClient />

    </div>
  )
}
