'use client'

// ── CommandBar — Global ⌘K Executive Command Palette ─────────────────────────
//
// Open via: ⌘K (macOS) | Ctrl+K (Windows/Linux) | sidebar trigger button
// Custom event: window.dispatchEvent(new CustomEvent('flowra:cmd'))
//
// Groups:
//   Merkezler   — navigate to hub centers
//   Oluştur     — create new records
//   Hızlı Git   — jump to specific tabs

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Cmd {
  id:   string
  grp:  string
  label: string
  sub?:  string
  href: string
  kind: 'nav' | 'create' | 'quick'
}

const CMDS: Cmd[] = [
  // ── Merkezler ──────────────────────────────────────────────────────────────
  { id: 'n-home', grp: 'Merkezler', label: 'CEO Komuta',          sub: 'Ana panel · Karar sırası · Durum skoru',  href: '/dashboard',                            kind: 'nav'    },
  { id: 'n-fin',  grp: 'Merkezler', label: 'Finans Merkezi',      sub: 'P&L · Bilanço · CFO Cockpit · Nakit',   href: '/dashboard/finance',                    kind: 'nav'    },
  { id: 'n-com',  grp: 'Merkezler', label: 'Ticari Akış',         sub: 'Satış · Tahsilat · Pipeline · Proforma', href: '/dashboard/commercial',                 kind: 'nav'    },
  { id: 'n-ops',  grp: 'Merkezler', label: 'Operasyon Merkezi',   sub: 'Gider · Katalog · Stok · Sipariş',      href: '/dashboard/operations',                 kind: 'nav'    },
  { id: 'n-par',  grp: 'Merkezler', label: 'Ortak Finans',        sub: 'Borç · Dağıtım · Getiri · Waterfall',   href: '/dashboard/partners',                   kind: 'nav'    },
  { id: 'n-pln',  grp: 'Merkezler', label: 'Planlama Merkezi',    sub: 'Senaryo · Simülasyon · Görevler',       href: '/dashboard/planning',                   kind: 'nav'    },

  // ── Oluştur ────────────────────────────────────────────────────────────────
  { id: 'c-exp',  grp: 'Oluştur',   label: 'Gider Kaydet',        href: '/dashboard/expenses/new',              kind: 'create' },
  { id: 'c-sal',  grp: 'Oluştur',   label: 'Satış Oluştur',       href: '/dashboard/sales/new',                 kind: 'create' },
  { id: 'c-pro',  grp: 'Oluştur',   label: 'Proforma Hazırla',    href: '/dashboard/proformas/new',             kind: 'create' },
  { id: 'c-tsk',  grp: 'Oluştur',   label: 'Görev Ekle',          href: '/dashboard/planning?tab=tasks',        kind: 'create' },

  // ── Hızlı Git ──────────────────────────────────────────────────────────────
  { id: 'q-cfo',  grp: 'Hızlı Git', label: 'CFO Kokpiti',         href: '/dashboard/finance?tab=cfo',                   kind: 'quick' },
  { id: 'q-csh',  grp: 'Hızlı Git', label: 'Nakit Akışı',         href: '/dashboard/finance?tab=cashflow',              kind: 'quick' },
  { id: 'q-pnl',  grp: 'Hızlı Git', label: 'Kâr / Zarar',         href: '/dashboard/finance?tab=pnl',                   kind: 'quick' },
  { id: 'q-col',  grp: 'Hızlı Git', label: 'Tahsilat Takibi',     href: '/dashboard/commercial?tab=collections',        kind: 'quick' },
  { id: 'q-pip',  grp: 'Hızlı Git', label: 'Satış Pipeline',      href: '/dashboard/commercial?tab=pipeline',           kind: 'quick' },
  { id: 'q-rsk',  grp: 'Hızlı Git', label: 'Risk Analizi',        href: '/dashboard/finance?tab=risks',                 kind: 'quick' },
  { id: 'q-sim',  grp: 'Hızlı Git', label: 'Senaryo Analizi',     href: '/dashboard/planning?tab=scenarios',            kind: 'quick' },
  { id: 'q-wtr',  grp: 'Hızlı Git', label: 'Borç Waterfall',      href: '/dashboard/partners?tab=waterfall',            kind: 'quick' },
  { id: 'q-trn',  grp: 'Hızlı Git', label: 'Borç Tranşeleri',     href: '/dashboard/partners?tab=tranches',             kind: 'quick' },
  { id: 'q-stk',  grp: 'Hızlı Git', label: 'Stok Durumu',         href: '/dashboard/operations?tab=stock',              kind: 'quick' },
  { id: 'q-kdv',  grp: 'Hızlı Git', label: 'KDV Beyanı',          href: '/dashboard/cfo/tax/kdv',                       kind: 'quick' },
  { id: 'q-per',  grp: 'Hızlı Git', label: 'Dönem Kapanışı',      href: '/dashboard/cfo/period-close',                  kind: 'quick' },
]

export function CommandBar() {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel]     = useState(0)
  const inputRef          = useRef<HTMLInputElement>(null)
  const router            = useRouter()

  const close = useCallback(() => setOpen(false), [])

  // ── Keyboard shortcut + custom event ──────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o) }
      if (e.key === 'Escape') close()
    }
    function onCustom() { setOpen(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('flowra:cmd', onCustom)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('flowra:cmd', onCustom)
    }
  }, [close])

  // ── Focus input when opened ────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery('')
      setSel(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return CMDS
    const q = query.toLowerCase().trim()
    return CMDS.filter(c =>
      c.label.toLowerCase().includes(q) ||
      (c.sub?.toLowerCase().includes(q) ?? false) ||
      c.grp.toLowerCase().includes(q)
    )
  }, [query])

  // ── Grouped for display (index = position in filtered flat array) ──────────
  const groups = useMemo(() => {
    const map = new Map<string, { cmd: Cmd; flatIdx: number }[]>()
    filtered.forEach((cmd, flatIdx) => {
      const arr = map.get(cmd.grp) ?? []
      arr.push({ cmd, flatIdx })
      map.set(cmd.grp, arr)
    })
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
  }, [filtered])

  function exec(cmd: Cmd) {
    close()
    router.push(cmd.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && filtered[sel]) exec(filtered[sel])
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[13vh] px-4">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={close}
      />

      {/* Command panel */}
      <div
        className="relative w-full max-w-[520px] bg-white rounded-2xl border border-gray-200 shadow-[0_24px_48px_rgba(17,24,39,0.18),0_8px_16px_rgba(17,24,39,0.08)] overflow-hidden"
        style={{ maxHeight: '72vh' }}
      >

        {/* ── Search row ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSel(0) }}
            onKeyDown={onKeyDown}
            placeholder="Ara veya komut gir..."
            className="flex-1 text-[13px] text-gray-900 placeholder:text-gray-400 bg-transparent outline-none"
          />
          <kbd className="text-[9px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono leading-tight flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(72vh - 56px)' }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-sm text-gray-400">"{query}" için sonuç bulunamadı</div>
            </div>
          ) : (
            <div className="py-2">
              {groups.map(grp => (
                <div key={grp.name}>
                  {/* Group header */}
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                      {grp.name}
                    </span>
                  </div>

                  {/* Items */}
                  {grp.items.map(({ cmd, flatIdx }) => {
                    const isSelected = sel === flatIdx
                    const iconEl =
                      cmd.kind === 'nav'    ? <span className="text-violet-500 text-[9px] font-black">◆</span> :
                      cmd.kind === 'create' ? <span className="text-emerald-500 text-sm font-black leading-none">+</span> :
                                             <span className="text-gray-400 text-xs">→</span>
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => exec(cmd)}
                        onMouseEnter={() => setSel(flatIdx)}
                        className={[
                          'relative w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          isSelected ? 'bg-violet-50' : 'hover:bg-gray-50',
                        ].join(' ')}
                      >
                        {/* Active left accent bar */}
                        {isSelected && (
                          <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-violet-500 rounded-r-full" />
                        )}

                        {/* Icon */}
                        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                          {iconEl}
                        </span>

                        {/* Label + sub */}
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] leading-tight truncate ${
                            isSelected ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                          }`}>
                            {cmd.label}
                          </div>
                          {cmd.sub && (
                            <div className="text-[11px] text-gray-400 truncate mt-0.5">
                              {cmd.sub}
                            </div>
                          )}
                        </div>

                        {/* Enter hint when selected */}
                        {isSelected && (
                          <kbd className="flex-shrink-0 text-[9px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono leading-tight">
                            ↵
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-[9px] text-gray-300 font-mono">↑↓ seç</span>
              <span className="text-[9px] text-gray-300 font-mono">↵ git</span>
              <span className="text-[9px] text-gray-300 font-mono">ESC kapat</span>
            </div>
            <span className="text-[9px] text-gray-300">Flowra OS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
