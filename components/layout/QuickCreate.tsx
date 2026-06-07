'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/layout/QuickCreate.tsx
//
// Task-first "+ Yeni" quick-action. One menu, reachable from every screen, to
// create the core records a CEO / CFO / field-sales needs — in 1-2 clicks. Each
// item deep-links to the create flow; drawer-based forms auto-open via ?new=1.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react'
import Link from 'next/link'

const ACTIONS: { label: string; href: string; icon: string; primary?: boolean }[] = [
  { label: 'Yeni Satış',    href: '/dashboard/commercial?tab=sales&new=1',     icon: '₺', primary: true },
  { label: 'Yeni Teklif',   href: '/dashboard/proformas/new',                  icon: '📝' },
  { label: 'Yeni Gider',    href: '/dashboard/operations?tab=expenses&new=1',  icon: '💸' },
  { label: 'Yeni Müşteri',  href: '/dashboard/commercial?tab=customers&new=1', icon: '👤' },
  { label: 'Yeni Ortak',    href: '/dashboard/partners/new',                   icon: '🤝' },
]

export function QuickCreate() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-[#7c3aed] text-white text-[12px] font-bold hover:bg-[#6d28d9] transition-colors whitespace-nowrap shadow-sm"
      >
        + Yeni
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute left-1/2 -translate-x-1/2 mt-1.5 z-40 w-48 rounded-xl border border-[#e2e8f0] bg-white shadow-lg overflow-hidden py-1"
          >
            {ACTIONS.map(a => (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className={`flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f8fafc] transition-colors ${
                  a.primary ? 'font-semibold text-[#0f172a]' : 'text-[#334155]'
                }`}
              >
                <span className="w-5 text-center text-[13px]">{a.icon}</span>
                {a.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
