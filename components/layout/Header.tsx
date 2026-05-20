'use client'
// Header — topbar
// Left:   current page title (from pathname via HeaderLeft)
// Center: quick-action shortcuts (+ Proforma · + Gider · Tahsilat)
// Right:  FxTicker (fixed far-right)

import Link             from 'next/link'
import { FxTicker }     from '@/components/layout/FxTicker'
import { HeaderLeft }   from '@/components/layout/HeaderLeft'

interface Props {
  companyName:  string | null
  userName:     string
  userEmail:    string
  logoUrl:      string | null
  title?:       string
}

export function Header({ companyName }: Props) {
  return (
    <header className="h-11 bg-white border-b border-[#e2e8f0] flex items-center justify-between px-4 flex-shrink-0 sticky top-0 z-10 gap-3">

      {/* LEFT — mobile brand */}
      <div className="flex items-center gap-2 md:hidden flex-shrink-0">
        <div className="w-5 h-5 rounded-md bg-brand-light flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-[9px]">FL</span>
        </div>
        <span className="font-black text-sm text-[#0f172a]">Flowra</span>
      </div>

      {/* LEFT — desktop page title (pathname-aware) */}
      <HeaderLeft companyName={companyName} />

      {/* CENTER — global quick actions */}
      <div className="hidden md:flex items-center gap-1.5 flex-1 justify-center">
        <Link
          href="/dashboard/proformas/new"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0f172a] text-white text-[11px] font-semibold hover:bg-[#334155] transition-colors whitespace-nowrap">
          + Proforma
        </Link>
        <Link
          href="/dashboard/operations?tab=expenses"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#e2e8f0] text-[#334155] text-[11px] font-semibold hover:bg-[#f8fafc] transition-colors whitespace-nowrap">
          + Gider
        </Link>
        <Link
          href="/dashboard/commercial?tab=collections"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-brand-light text-white text-[11px] font-semibold hover:bg-brand transition-colors whitespace-nowrap">
          Tahsilat
        </Link>
      </div>

      {/* RIGHT — FX ticker (fixed far-right) */}
      <div className="hidden md:flex items-center flex-shrink-0">
        <FxTicker />
      </div>

    </header>
  )
}
