'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CapitalStructureClient
//
// Sermaye Yapısı Analizi — Capital Structure & Debt Capacity dashboard panel.
//
// Features:
//   - Leverage capacity score + capital structure health badge
//   - DSCR card (most important metric)
//   - Capital structure split: equity % vs debt %
//   - Debt capacity bars: current vs conservative / optimal / maximum
//   - Weighted Average Cost of Debt (WACD)
//   - Partner loan risk premium
//
// TanStack Query key: ['capital-structure', companyId]
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }        from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Report shape (mirrors CapitalStructureService.getReport return type) ───────

interface CapitalReport {
  capital_structure: {
    total_equity:   number
    total_debt:     number
    partner_loans:  number
    bank_loans:     number
    debt_to_equity: number | null
    debt_to_ebitda: number | null
  }
  debt_service: {
    annual_principal:          number
    annual_interest:           number
    total_annual_debt_service: number
    dscr:                      number | null
    dscr_health:               string
  }
  capacity: {
    conservative: number
    optimal:      number
    maximum:      number
  }
  headroom:         number
  wacd:             number | null
  leverage_score:   number
  structure_health: string
  ebitda_ytd:       number
}

// ── Badge configs ──────────────────────────────────────────────────────────────

const STRUCTURE_BADGE: Record<string, { label: string; cls: string }> = {
  conservative: { label: 'Muhafazakâr',    cls: 'bg-green-100  text-green-800  border-green-200'  },
  balanced:     { label: 'Dengeli',        cls: 'bg-info-light   text-info-text   border-info-light'   },
  leveraged:    { label: 'Kaldıraçlı',    cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  over_leveraged: { label: 'Aşırı Borçlu', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  critical:     { label: 'Kritik',         cls: 'bg-red-100    text-red-800    border-red-200'    },
}

const DSCR_BADGE: Record<string, { label: string; cls: string }> = {
  strong:            { label: 'Güçlü',            cls: 'bg-green-100  text-green-800  border-green-200'  },
  adequate:          { label: 'Yeterli',           cls: 'bg-info-light   text-info-text   border-info-light'   },
  tight:             { label: 'Sınırda',           cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  distressed:        { label: 'Stresli',           cls: 'bg-red-100    text-red-800    border-red-200'    },
  insufficient_data: { label: 'Veri Yetersiz',     cls: 'bg-[#f1f5f9]   text-[#475569]   border-[#e8eaef]'   },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Badge({ config }: { config: { label: string; cls: string } }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${config.cls}`}>
      {config.label}
    </span>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  valueColor = 'text-[#0f172a]',
}: {
  label:       string
  value:       string
  sub?:        string
  valueColor?: string
}) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{sub}</div>}
    </div>
  )
}

/** Simple horizontal bar showing current vs max with labeled segments */
function DebtCapacityBar({
  label,
  current,
  max,
  barColor,
}: {
  label:    string
  current:  number
  max:      number
  barColor: string
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-semibold text-[#64748b] mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{fmtTRY(max)}</span>
      </div>
      <div className="h-3 rounded-full bg-[#f1f5f9] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-[#94a3b8] mt-0.5">
        <span>Mevcut: {fmtTRY(current)}</span>
        <span>{pct.toFixed(0)}% kullanıldı</span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CapitalStructureClient({ companyId }: Props) {
  const { data: raw, isLoading, isError } = useQuery<{ report: CapitalReport }>({
    queryKey: ['capital-structure', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/capital-structure')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 bg-[#f1f5f9] rounded w-52" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-[#f1f5f9] rounded" />)}
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError || !raw) {
    return (
      <div className="text-[11px] text-[#94a3b8] py-3">
        Sermaye yapısı verileri yüklenemedi.
      </div>
    )
  }

  const data = raw.report
  const { capital_structure: cs, debt_service: ds, capacity, headroom } = data

  const structureBadge = STRUCTURE_BADGE[data.structure_health] ?? STRUCTURE_BADGE.balanced
  const dscrBadge      = DSCR_BADGE[ds.dscr_health]             ?? DSCR_BADGE.insufficient_data

  // Equity / Debt split
  const total         = cs.total_equity + cs.total_debt
  const equityPct     = total > 0 ? (cs.total_equity / total) * 100 : 0
  const debtPct       = total > 0 ? (cs.total_debt   / total) * 100 : 0

  // Score color
  const scoreColor =
    data.leverage_score >= 60 ? 'text-green-700'  :
    data.leverage_score >= 40 ? 'text-yellow-700' : 'text-red-700'

  const dscrColor =
    ds.dscr_health === 'strong'   ? 'text-green-700'  :
    ds.dscr_health === 'adequate' ? 'text-info-text'   :
    ds.dscr_health === 'tight'    ? 'text-yellow-700' : 'text-red-700'

  const headroomColor = headroom >= 0 ? 'text-green-700' : 'text-red-700'

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
          Sermaye Yapısı Analizi
        </h3>
        <Badge config={structureBadge} />
      </div>

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Kaldıraç Kapasitesi"
          value={`${data.leverage_score.toFixed(1)} / 100`}
          sub="Bileşik sermaye yapısı skoru"
          valueColor={scoreColor}
        />
        <SummaryCard
          label="DSCR (Borç Servisi)"
          value={ds.dscr != null ? ds.dscr.toFixed(2) + '×' : '—'}
          sub="FAVÖK / Yıllık borç servisi"
          valueColor={dscrColor}
        />
        <SummaryCard
          label="FAVÖK (YTD)"
          value={fmtTRY(data.ebitda_ytd)}
          sub="Yıl başından bu yana"
          valueColor={data.ebitda_ytd >= 0 ? 'text-green-700' : 'text-red-700'}
        />
        <SummaryCard
          label="Borç Kapasitesi Fazlası"
          value={fmtTRY(Math.abs(headroom))}
          sub={headroom >= 0 ? 'Maks. kapasiteye mesafe' : 'Aşım — fazla borçlanma'}
          valueColor={headroomColor}
        />
      </div>

      {/* DSCR detail card */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
            Borç Servisi Karşılama Oranı (DSCR)
          </span>
          <Badge config={dscrBadge} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#f1f5f9]">
          <div className="px-4 py-3 text-center">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">Yıllık Anapara</div>
            <div className="text-base font-bold tabular-nums text-[#0f172a]">{fmtTRY(ds.annual_principal)}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">Yıllık Faiz</div>
            <div className="text-base font-bold tabular-nums text-[#0f172a]">{fmtTRY(ds.annual_interest)}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">Toplam Borç Servisi</div>
            <div className="text-base font-bold tabular-nums text-[#334155]">{fmtTRY(ds.total_annual_debt_service)}</div>
          </div>
        </div>
        {/* DSCR interpretation */}
        <div className="px-4 py-2 border-t border-[#f1f5f9] text-[10px] text-[#94a3b8]">
          DSCR {'>'} 2.0 = Güçlü &nbsp;|&nbsp; {'>'} 1.25 = Yeterli &nbsp;|&nbsp; {'>'} 1.0 = Başa baş &nbsp;|&nbsp; {'<'} 1.0 = Stresli
        </div>
      </div>

      {/* Capital structure split */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
            Sermaye Yapısı — Özsermaye / Borç Dağılımı
          </span>
        </div>
        <div className="px-4 py-4 space-y-3">
          {/* Bar */}
          <div className="h-4 rounded-full bg-[#f1f5f9] overflow-hidden flex">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(100, equityPct)}%` }}
            />
            <div
              className="h-full bg-orange-400 transition-all duration-500"
              style={{ width: `${Math.min(100, debtPct)}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#0f172a]">Özsermaye</div>
                <div className="tabular-nums text-[#64748b]">{fmtTRY(cs.total_equity)}</div>
                <div className="text-[9px] text-[#94a3b8]">{fmtPct(equityPct)} pay</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#0f172a]">Toplam Borç</div>
                <div className="tabular-nums text-[#64748b]">{fmtTRY(cs.total_debt)}</div>
                <div className="text-[9px] text-[#94a3b8]">{fmtPct(debtPct)} pay</div>
              </div>
            </div>
          </div>
          {/* Ratios */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#f1f5f9]">
            <div className="text-xs">
              <div className="text-[#94a3b8] font-semibold mb-0.5">Borç / Özsermaye</div>
              <div className="font-bold tabular-nums text-[#0f172a]">
                {cs.debt_to_equity != null ? cs.debt_to_equity.toFixed(2) + '×' : '—'}
              </div>
            </div>
            <div className="text-xs">
              <div className="text-[#94a3b8] font-semibold mb-0.5">Borç / FAVÖK</div>
              <div className="font-bold tabular-nums text-[#0f172a]">
                {cs.debt_to_ebitda != null ? cs.debt_to_ebitda.toFixed(2) + '×' : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Debt capacity bars */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
            Borç Kapasitesi — FAVÖK Çarpanı Bazlı
          </span>
        </div>
        <div className="px-4 py-4 space-y-4">
          <DebtCapacityBar
            label="Muhafazakâr Kapasite (2.0× FAVÖK)"
            current={cs.total_debt}
            max={capacity.conservative}
            barColor="bg-green-400"
          />
          <DebtCapacityBar
            label="Optimal Kapasite (3.0× FAVÖK)"
            current={cs.total_debt}
            max={capacity.optimal}
            barColor="bg-blue-400"
          />
          <DebtCapacityBar
            label="Maksimum Kapasite (4.0× FAVÖK)"
            current={cs.total_debt}
            max={capacity.maximum}
            barColor="bg-orange-400"
          />
        </div>
      </div>

      {/* WACD and partner loan detail */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
            Borçlanma Maliyeti
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-[#f1f5f9] sm:grid-cols-3">
          <div className="px-4 py-3">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">
              Ağırlıklı Ort. Borç Maliyeti (WACD)
            </div>
            <div className="text-xl font-extrabold tabular-nums text-[#0f172a]">
              {data.wacd != null ? fmtPct(data.wacd) : '—'}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">Yıllık faiz oranı</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">
              Ortak Kredileri
            </div>
            <div className="text-xl font-extrabold tabular-nums text-[#0f172a]">
              {fmtTRY(cs.partner_loans)}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">Toplam bakiye</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">
              Yıllık Faiz Gideri
            </div>
            <div className="text-xl font-extrabold tabular-nums text-[#0f172a]">
              {fmtTRY(ds.annual_interest)}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">Tahmini yıllık maliyet</div>
          </div>
        </div>
      </div>

    </div>
  )
}

export default CapitalStructureClient
