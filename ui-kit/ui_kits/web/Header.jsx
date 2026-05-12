/* global React, Icon */
function Header({ title, subtitle, action }) {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-gray-200 px-8 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          <button className="w-9 h-9 rounded-xl border border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-500 hover:text-gray-700 relative">
            <Icon name="bell" size={16} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-600 rounded-full"></span>
          </button>
        </div>
      </div>
    </header>
  );
}
window.Header = Header;
