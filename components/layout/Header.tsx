'use client'
// Header — Bloomberg-style topbar.
// Left: company name breadcrumb (desktop)
// Center: FxTicker compact strip (desktop)
// Right: reserved (notifications wired in future phase)

import { FxTicker } from '@/components/layout/FxTicker'

interface Props {
  companyName:  string | null
  userName:     string
  userEmail:    string
  logoUrl:      string | null
  title?:       string
}

export function Header({ companyName }: Props) {
  return (
    <header className="h-11 bg-white border-b border-[#e2e8f0] flex items-center justify-between px-4 flex-shrink-0 sticky top-0 z-10">

      {/* LEFT — mobile brand */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="w-5 h-5 rounded-md bg-brand-light flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-[9px]">FL</span>
        </div>
        <span className="font-black text-sm text-[#0f172a]">Flowra</span>
      </div>

      {/* LEFT — desktop company breadcrumb */}
      <div className="hidden md:flex items-center">
        {companyName && (
          <span className="text-[10px] font-semibold text-[#94a3b8] tracking-wide">{companyName}</span>
        )}
      </div>

      {/* CENTER — FX ticker strip */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <FxTicker />
      </div>

      {/* RIGHT — placeholder (notifications wired in future) */}
      <div className="w-8" />

    </header>
  )
}
