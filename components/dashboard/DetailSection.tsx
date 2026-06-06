'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/dashboard/DetailSection.tsx
//
// Progressive disclosure: a collapsed-by-default "Detaylı Analiz" panel. The deep
// analytics that used to stack 4-9 tall on every tab live in here now. Children
// are rendered ONLY when expanded, so the heavy client components inside don't
// mount or fetch until the user actually asks for them — keeping the default view
// compact and fast.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, ReactNode } from 'react'

export function DetailSection({
  title = 'Detaylı Analiz',
  subtitle,
  children,
  defaultOpen = false,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="border border-[#e2e8f0] rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#f8fafc] transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#0f172a]">{title}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8] bg-[#f1f5f9] rounded px-1.5 py-0.5">
              {open ? 'Açık' : 'Gizli'}
            </span>
          </div>
          {subtitle && <p className="text-[11px] text-[#94a3b8] mt-0.5 truncate">{subtitle}</p>}
        </div>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#7c3aed] shrink-0">
          {open ? 'Gizle' : 'Göster'}
          <svg
            className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-4 border-t border-[#f1f5f9]">{children}</div>}
    </section>
  )
}
