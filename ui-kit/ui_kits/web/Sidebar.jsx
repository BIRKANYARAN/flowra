/* global React, Icon, Btn */
const { useState } = React;

const NAV = [
  { href: 'dashboard', label: 'Genel Durum', icon: 'layout-grid' },
  { group: 'Finans' },
  { href: 'sales',       label: 'Satışlar',     icon: 'banknote' },
  { href: 'collections', label: 'Tahsilatlar',  icon: 'landmark' },
  { href: 'expenses',    label: 'Giderler',     icon: 'trending-down' },
  { group: 'Operasyon' },
  { href: 'proformas', label: 'Proformalar', icon: 'file-text' },
  { href: 'customers', label: 'Müşteriler',  icon: 'users' },
  { href: 'products',  label: 'Ürünler',     icon: 'tag' },
  { href: 'stocks',    label: 'Stoklar',     icon: 'package' },
  { group: 'Araçlar' },
  { href: 'simulation', label: 'Simülasyon', icon: 'calculator' },
  { href: 'analytics',  label: 'Analitik',   icon: 'bar-chart-3' },
  { group: 'Yönetim' },
  { href: 'settings', label: 'Ayarlar', icon: 'settings' },
];

function Sidebar({ active, onNav, user, onLogout }) {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      {/* logo */}
      <div className="px-5 py-5 border-b border-gray-100 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 via-violet-500 to-blue-500 flex items-center justify-center shadow-sm">
          <span className="text-white font-black text-lg leading-none">F</span>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-black text-lg text-gray-900 tracking-tight">flowra</span>
          <span className="text-[10px] text-gray-400 font-medium tracking-wide mt-0.5">finansal akış</span>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV.map((item, i) =>
          item.group ? (
            <div key={i} className="pt-3 pb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-gray-300">
              {item.group}
            </div>
          ) : (
            <button
              key={item.href}
              onClick={() => onNav(item.href)}
              className={
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors text-left ' +
                (active === item.href
                  ? 'bg-violet-600 text-white font-semibold shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')
              }
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </button>
          ),
        )}
      </nav>

      {/* user */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{user.name}</div>
            <div className="text-[10px] text-gray-400 truncate">{user.email}</div>
          </div>
          <span className="text-[9px] font-bold tracking-wider text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
            {user.role}
          </span>
        </div>
        <button onClick={onLogout} className="w-full mt-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50">
          <Icon name="log-out" size={13} />
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
