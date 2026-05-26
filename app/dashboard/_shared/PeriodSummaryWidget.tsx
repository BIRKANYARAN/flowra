'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PeriodSummaryWidget — Client wrapper that fetches narrative via API
// and renders PeriodSummaryCard.
// Uses TanStack Query (5-minute stale time mirrors server revalidate: 300).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { PeriodSummaryCard } from './PeriodSummaryCard'
import type { FinancialNarrative } from '@/lib/services/intelligence/narrative.service'

interface Props {
  from: string
  to:   string
}

export function PeriodSummaryWidget({ from, to }: Props) {
  const { data, isLoading, isError } = useQuery<FinancialNarrative>({
    queryKey: ['narrative', from, to],
    queryFn:  async () => {
      const res = await fetch(`/api/intelligence/narrative?from=${from}&to=${to}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<FinancialNarrative>
    },
    staleTime: 5 * 60 * 1000,  // 5 minutes
    retry:     1,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm px-4 py-3 animate-pulse">
        <div className="h-3 w-32 bg-[#e2e8f0] rounded mb-2" />
        <div className="h-4 w-full bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm px-4 py-3">
        <p className="text-[0.65rem] text-[#94a3b8]">Dönem özeti yüklenemedi.</p>
      </div>
    )
  }

  return <PeriodSummaryCard narrative={data} />
}
