'use client'
// Header — design-system tokens applied; same props, same output shape.

import { Icon } from '@/components/ui/Icon'

interface Props {
  companyName:  string | null
  userName:     string
  userEmail:    string
  logoUrl:      string | null
  /** Optional page title shown in header center */
  title?: string
}

export function Header({ companyName, userName }: Props) {
  return (
    <header className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-5 flex-shrink-0 sticky top-0 z-10">

      {/* LEFT — Mobile brand only */}
      <div className="flex items-center gap-2.5 md:hidden">
        <div className="w-6 h-6 rounded-md bg-primary-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-[10px]">FL</span>
        </div>
        <span className="font-black text-sm text-gray-900">Flowra</span>
      </div>

      {/* LEFT desktop — company name breadcrumb */}
      <div className="hidden md:flex items-center gap-2">
        {companyName && (
          <span className="text-xs font-medium text-gray-400">{companyName}</span>
        )}
      </div>

      {/* RIGHT — actions */}
      <div className="flex items-center gap-3 ml-auto">
        {/* User — mobile only */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="text-right">
            <div className="text-xs font-semibold text-gray-700 leading-tight">{userName || 'Kullanıcı'}</div>
          </div>
        </div>
        {/* Bell */}
        <button className="relative p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <Icon name="bell" size={15} />
        </button>
      </div>
    </header>
  )
}
