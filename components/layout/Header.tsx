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

export function Header({ companyName, userName, userEmail, logoUrl, title }: Props) {
  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10">

      {/* LEFT — Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-xs">FL</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-black text-sm text-gray-900">Flowra</span>
          <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">ERP</span>
        </div>
        {title && (
          <>
            <span className="text-gray-200 mx-1">/</span>
            <span className="text-sm font-semibold text-gray-600">{title}</span>
          </>
        )}
      </div>

      {/* RIGHT — Company + user + bell */}
      <div className="flex items-center gap-4">
        {/* Company logo + name */}
        {companyName && (
          <div className="flex items-center gap-2">
            {logoUrl && (
              <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
            <span className="text-sm font-semibold text-gray-700 hidden sm:inline">{companyName}</span>
          </div>
        )}

        {companyName && <div className="w-px h-5 bg-gray-200 hidden sm:block" />}

        {/* User */}
        <div className="text-right hidden sm:block">
          <div className="text-xs font-semibold text-gray-700 leading-tight">{userName || 'Kullanıcı'}</div>
          <div className="text-[11px] text-gray-400 leading-tight">{userEmail}</div>
        </div>

        {/* Bell */}
        <button className="relative p-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <Icon name="bell" size={16} />
        </button>
      </div>
    </header>
  )
}
