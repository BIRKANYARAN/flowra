'use client'
// Header — topbar
// Left:   current page title (from pathname via HeaderLeft)
// Center: quick-action shortcuts (+ Proforma · + Gider · Tahsilat)
// Right:  FxTicker (fixed far-right)

import Link             from 'next/link'
import { FxTicker }     from '@/components/layout/FxTicker'
import { HeaderLeft }   from '@/components/layout/HeaderLeft'
import { QuickCreate }  from '@/components/layout/QuickCreate'

interface Props {
  companyName:  string | null
  userName:     string
  userEmail:    string
  logoUrl:      string | null
  title?:       string
}

export function Header({ companyName }: Props) {
  return (
    <header className="h-11 bg-white border-b border-[#e8eaef] flex items-center justify-between px-4 flex-shrink-0 sticky top-0 z-10 gap-3">

      {/* LEFT — mobile brand */}
      <div className="flex items-center gap-2 md:hidden flex-shrink-0">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-white font-bold text-[10px] tracking-tight">FL</span>
        </div>
        <span className="font-bold text-sm text-[#0f172a] tracking-tight">Flowra</span>
      </div>

      {/* LEFT — desktop breadcrumb title (pathname + ?tab aware) */}
      <HeaderLeft companyName={companyName} />

      {/* RIGHT — primary action + Tahsilat shortcut, then FX ticker.
          Top-right is the conventional home for the primary action. */}
      <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <Link
          href="/dashboard/commercial?tab=collections"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#e8eaef] text-[#334155] text-[11px] font-semibold hover:bg-[#f8fafc] transition-colors whitespace-nowrap">
          Tahsilat
        </Link>
        <QuickCreate />
        <span aria-hidden className="w-px h-5 bg-[#e2e8f0] mx-0.5" />
        <FxTicker />
      </div>

    </header>
  )
}
