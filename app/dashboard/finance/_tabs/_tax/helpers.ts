// ── TaxTab pure helpers — extracted from TaxTab.tsx for testing ───────────────
// Pure date/KDV/Geçici-Vergi helpers (were inline + untested).

import type { QuarterResult } from '@/lib/finance/financial-core'

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export function lastNMonths(n: number, ref: Date): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref); d.setDate(1); d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function kdvPositionLabel(netVat: number): { label: string; color: string; bg: string } {
  if (netVat > 0) return { label: '⬆ Ödenecek',  color: 'text-warn-text', bg: 'bg-warn-light border-warn/20' }
  if (netVat < 0) return { label: '⬇ Devredilen', color: 'text-pos-text', bg: 'bg-pos-light border-pos-light' }
  return { label: 'Sıfır', color: 'text-[#64748b]', bg: 'bg-[#f8fafc] border-[#e2e8f0]' }
}

export function geciciStatus(dueDate: string, today: string): 'overdue' | 'urgent' | 'upcoming' | 'future' | 'none' {
  if (!dueDate) return 'none'
  if (dueDate < today)              return 'overdue'
  if (dueDate <= addDays(today, 14)) return 'urgent'
  if (dueDate <= addDays(today, 45)) return 'upcoming'
  return 'future'
}

export function nextGeciciDue(quarters: QuarterResult[], today: string): { label: string; date: string; amount: number } | null {
  const upcoming = quarters
    .filter(q => q.gecici_due_date && q.gecici_due_date >= today && q.gecici_vergi > 0)
    .sort((a, b) => a.gecici_due_date.localeCompare(b.gecici_due_date))
  if (!upcoming.length) return null
  const q = upcoming[0]
  return { label: q.label, date: q.gecici_due_date, amount: q.gecici_vergi }
}
