'use client'

// ── CommandBar — Flowra OS Executive Command System ───────────────────────────
//
// ⌘K / Ctrl+K — global shortcut
// window.dispatchEvent(new CustomEvent('flowra:cmd')) — programmatic trigger
//
// Architecture:
//   1. Static commands — always available (Operasyonlar, Oluştur, Merkezler)
//   2. Smart suggestions — loaded from /api/cfo-metrics on open
//      Surfaces contextual operational recommendations based on system state
//
// Command framing philosophy:
//   "What you want to DO" not "where you want to GO"
//   Bloomberg Terminal × Linear — operational commands, not nav breadcrumbs

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type CmdKind = 'op' | 'create' | 'nav' | 'quick' | 'smart'

interface Cmd {
  id:    string
  grp:   string
  label: string
  sub?:  string
  href:  string
  kind:  CmdKind
}

// ── Static command catalog ─────────────────────────────────────────────────────

const STATIC_CMDS: Cmd[] = [

  // ── Operasyonlar — action-framed, result-oriented ──────────────────────────
  { id: 'op-pnl',   grp: 'Operasyonlar', label: 'Bu ayın P&L\'ini incele',          sub: 'Ciro · Brüt kâr · Gider · Net',           href: '/dashboard/finance?tab=pnl',                    kind: 'op' },
  { id: 'op-csh',   grp: 'Operasyonlar', label: 'Nakit durumunu analiz et',          sub: 'Runway · Burn rate · Projeksiyon',         href: '/dashboard/planning?tab=cash-projection',       kind: 'op' },
  { id: 'op-rsk',   grp: 'Operasyonlar', label: 'Alacak riskini değerlendir',        sub: 'Yaşlandırma · 60g+ · Konsantrasyon',       href: '/dashboard/finance?tab=risks',                  kind: 'op' },
  { id: 'op-col',   grp: 'Operasyonlar', label: 'Tahsilat aksiyonu al',              sub: 'Gecikmiş ödemeler · Müşteri takibi',       href: '/dashboard/commercial?tab=collections',         kind: 'op' },
  { id: 'op-dbt',   grp: 'Operasyonlar', label: 'Borç baskısını simüle et',          sub: 'DSR · Tranche takvimi · Waterfall',        href: '/dashboard/planning?tab=debt-pressure',         kind: 'op' },
  { id: 'op-scn',   grp: 'Operasyonlar', label: 'Senaryo analizi çalıştır',          sub: 'Kötümser · Baz · İyimser · Karşılaştır',  href: '/dashboard/planning?tab=scenarios',             kind: 'op' },
  { id: 'op-kdv',   grp: 'Operasyonlar', label: 'KDV borcunu hesapla',              sub: 'Output · Input · Net · Beyanname',         href: '/dashboard/cfo/tax/kdv',                        kind: 'op' },
  { id: 'op-eq',    grp: 'Operasyonlar', label: 'Ortak eşitlemesini çalıştır',       sub: 'Waterfall · Normalize · Pay dengesi',     href: '/dashboard/partners?tab=waterfall',             kind: 'op' },
  { id: 'op-per',   grp: 'Operasyonlar', label: 'Dönem kapanışı kontrol et',         sub: 'Checklist · Mizan · Dönem durumu',        href: '/dashboard/cfo/period-close',                   kind: 'op' },
  { id: 'op-stk',   grp: 'Operasyonlar', label: 'Stok kritiklerini gör',             sub: 'Kritik seviye · FIFO · Değerleme',        href: '/dashboard/operations?tab=stock',               kind: 'op' },
  { id: 'op-pro',   grp: 'Operasyonlar', label: 'Açık proformaları gözden geçir',    sub: 'Onay bekleyen · Dönüşüm oranı',           href: '/dashboard/commercial?tab=proformas',           kind: 'op' },
  { id: 'op-bal',   grp: 'Operasyonlar', label: 'Bilanço pozisyonunu gör',           sub: 'Varlıklar · Yükümlülükler · Özsermaye',  href: '/dashboard/finance?tab=balance',                kind: 'op' },

  // ── Oluştur — creation commands ───────────────────────────────────────────
  { id: 'c-exp',   grp: 'Oluştur',       label: 'Gider kaydet',                      href: '/dashboard/expenses/new',               kind: 'create' },
  { id: 'c-sal',   grp: 'Oluştur',       label: 'Satış oluştur',                     href: '/dashboard/sales/new',                  kind: 'create' },
  { id: 'c-pro',   grp: 'Oluştur',       label: 'Proforma hazırla',                  href: '/dashboard/proformas/new',              kind: 'create' },
  { id: 'c-tsk',   grp: 'Oluştur',       label: 'Görev ekle',                        href: '/dashboard/planning?tab=tasks',         kind: 'create' },

  // ── Merkezler — navigation ────────────────────────────────────────────────
  { id: 'n-home',  grp: 'Merkezler',     label: 'CEO Komuta',         sub: 'Ana panel · Karar sırası · Durum',    href: '/dashboard',                            kind: 'nav' },
  { id: 'n-fin',   grp: 'Merkezler',     label: 'Finans Merkezi',     sub: 'P&L · Bilanço · CFO · Nakit',        href: '/dashboard/finance',                    kind: 'nav' },
  { id: 'n-com',   grp: 'Merkezler',     label: 'Ticari Akış',        sub: 'Satış · Tahsilat · Pipeline',        href: '/dashboard/commercial',                 kind: 'nav' },
  { id: 'n-ops',   grp: 'Merkezler',     label: 'Operasyon Merkezi',  sub: 'Gider · Katalog · Stok',             href: '/dashboard/operations',                 kind: 'nav' },
  { id: 'n-par',   grp: 'Merkezler',     label: 'Ortak Finans',       sub: 'Borç · Dağıtım · Getiri',           href: '/dashboard/partners',                   kind: 'nav' },
  { id: 'n-pln',   grp: 'Merkezler',     label: 'Planlama Merkezi',   sub: 'Senaryo · Simülasyon · Görevler',   href: '/dashboard/planning',                   kind: 'nav' },
]

// ── Smart suggestion builder ───────────────────────────────────────────────────

interface CfoSnapshot {
  cash?:        { true_cash_position?: number; distributable_cash?: number }
  burn?:        { runway_days?: number | null }
  receivables?: { total_outstanding?: number; overdue_60d?: number }
  tax?:         { kdv_net?: number; corporate_tax_estimate?: number }
}

const TRY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M₺'
  if (abs >= 100_000)   return Math.round(n / 1_000) + 'K₺'
  return '₺' + TRY.format(n)
}

function buildSmartSuggestions(d: CfoSnapshot): Cmd[] {
  const suggestions: Cmd[] = []
  const runway  = d.burn?.runway_days ?? -1
  const cash    = d.cash?.true_cash_position ?? 0
  const ov60    = d.receivables?.overdue_60d ?? 0
  const kdv     = d.tax?.kdv_net ?? 0

  if (runway >= 0 && runway < 60) {
    suggestions.push({
      id: 's-runway', grp: 'Akıllı Öneriler',
      label: `⚡ Nakit krizi — ${runway}g kaldı`,
      sub:   `Acil nakit projeksiyonu ve eylem planı`,
      href:  '/dashboard/planning?tab=cash-projection', kind: 'smart',
    })
  } else if (runway >= 0 && runway < 120) {
    suggestions.push({
      id: 's-runway', grp: 'Akıllı Öneriler',
      label: `⚡ Runway kısalıyor — ${runway}g`,
      sub:   `Nakit optimizasyonu simüle et`,
      href:  '/dashboard/planning?tab=cash-projection', kind: 'smart',
    })
  }

  if (ov60 > 20_000) {
    suggestions.push({
      id: 's-ov60', grp: 'Akıllı Öneriler',
      label: `⚡ ${fmtK(ov60)} 60+ gün gecikmiş`,
      sub:   `Tahsilat aksiyonu — nakit'e direkt etkisi var`,
      href:  '/dashboard/commercial?tab=collections', kind: 'smart',
    })
  }

  if (kdv > 50_000) {
    suggestions.push({
      id: 's-kdv', grp: 'Akıllı Öneriler',
      label: `⚡ ${fmtK(kdv)} KDV ödenecek`,
      sub:   `Beyanname tarihi yaklaşıyor — nakit planla`,
      href:  '/dashboard/cfo/tax/kdv', kind: 'smart',
    })
  }

  if (cash < 100_000 && cash >= 0) {
    suggestions.push({
      id: 's-cash', grp: 'Akıllı Öneriler',
      label: `⚡ Nakit rezervi düşük — ${fmtK(cash)}`,
      sub:   `Burn rate ve yükümlülükleri gözden geçir`,
      href:  '/dashboard/finance?tab=cashflow', kind: 'smart',
    })
  }

  return suggestions.slice(0, 3) // max 3 smart suggestions
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandBar() {
  const [open, setOpen]             = useState(false)
  const [query, setQuery]           = useState('')
  const [sel, setSel]               = useState(0)
  const [smartCmds, setSmartCmds]   = useState<Cmd[]>([])
  const [smartLoading, setSmartLoading] = useState(false)
  const inputRef                    = useRef<HTMLInputElement>(null)
  const router                      = useRouter()

  const close = useCallback(() => setOpen(false), [])

  // ── Global keyboard + custom event ────────────────────────────────────────
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

  // ── Focus + fetch smart suggestions on open ────────────────────────────────
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSel(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    // Load smart suggestions from system state
    setSmartLoading(true)
    fetch('/api/cfo-metrics')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setSmartCmds(buildSmartSuggestions(d as CfoSnapshot))
      })
      .catch(() => {})
      .finally(() => setSmartLoading(false))
  }, [open])

  // ── All commands (smart suggestions first when no query) ──────────────────
  const allCmds = useMemo(() => {
    if (query.trim()) return STATIC_CMDS // don't mix smart into search
    return [...smartCmds, ...STATIC_CMDS]
  }, [smartCmds, query])

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return allCmds
    const q = query.toLowerCase().trim()
    return STATIC_CMDS.filter(c =>
      c.label.toLowerCase().includes(q) ||
      (c.sub?.toLowerCase().includes(q) ?? false) ||
      c.grp.toLowerCase().includes(q)
    )
  }, [query, allCmds])

  // ── Grouped for display ────────────────────────────────────────────────────
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
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={close} />

      {/* Panel */}
      <div
        className="relative w-full max-w-[560px] bg-white rounded border border-[#e2e8f0] shadow-[0_24px_48px_rgba(17,24,39,0.18),0_8px_16px_rgba(17,24,39,0.08)] overflow-hidden"
        style={{ maxHeight: '74vh' }}
      >
        {/* ── Search row ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e2e8f0]">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSel(0) }}
            onKeyDown={onKeyDown}
            placeholder="Operasyon ara veya komut gir..."
            className="flex-1 text-[13px] text-gray-900 placeholder:text-gray-400 bg-transparent outline-none"
          />
          {smartLoading && (
            <span className="w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin flex-shrink-0" />
          )}
          <kbd className="text-[9px] text-gray-400 bg-gray-100 border border-[#e2e8f0] px-1.5 py-0.5 rounded font-mono leading-tight flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* ── Results ───────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(74vh - 56px)' }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-sm text-gray-400">"{query}" için operasyon bulunamadı</div>
            </div>
          ) : (
            <div className="py-2">
              {groups.map(grp => (
                <div key={grp.name}>
                  {/* Group header */}
                  <div className={`px-4 pt-3 pb-1 flex items-center gap-2 ${
                    grp.name === 'Akıllı Öneriler' ? 'pt-2' : ''
                  }`}>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                      {grp.name}
                    </span>
                    {grp.name === 'Akıllı Öneriler' && (
                      <span className="text-[8px] font-bold bg-brand-subtle text-brand px-1.5 py-0.5 rounded">
                        CANLI
                      </span>
                    )}
                  </div>

                  {/* Items */}
                  {grp.items.map(({ cmd, flatIdx }) => {
                    const isSelected = sel === flatIdx
                    const iconEl =
                      cmd.kind === 'smart'  ? <span className="text-brand-light text-xs">⚡</span> :
                      cmd.kind === 'op'     ? <span className="text-[#64748b] text-[10px] font-black">▶</span> :
                      cmd.kind === 'create' ? <span className="text-pos text-sm font-black leading-none">+</span> :
                      cmd.kind === 'nav'    ? <span className="text-brand text-[9px] font-black">◆</span> :
                                             <span className="text-gray-400 text-xs">→</span>
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => exec(cmd)}
                        onMouseEnter={() => setSel(flatIdx)}
                        className={[
                          'relative w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          isSelected
                            ? cmd.kind === 'smart' ? 'bg-brand-subtle/30' : 'bg-[#f8fafc]'
                            : '',
                        ].join(' ')}
                      >
                        {/* Left accent */}
                        {isSelected && (
                          <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${
                            cmd.kind === 'smart' ? 'bg-brand' : 'bg-[#94a3b8]'
                          }`} />
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

                        {/* Enter hint */}
                        {isSelected && (
                          <kbd className="flex-shrink-0 text-[9px] text-gray-400 bg-gray-100 border border-[#e2e8f0] px-1.5 py-0.5 rounded font-mono leading-tight">
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

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#f1f5f9]">
            <div className="flex items-center gap-3">
              <span className="text-[9px] text-gray-300 font-mono">↑↓ seç</span>
              <span className="text-[9px] text-gray-300 font-mono">↵ çalıştır</span>
              <span className="text-[9px] text-gray-300 font-mono">ESC kapat</span>
            </div>
            <span className="text-[9px] text-gray-300">Flowra OS · ⌘K</span>
          </div>
        </div>
      </div>
    </div>
  )
}
