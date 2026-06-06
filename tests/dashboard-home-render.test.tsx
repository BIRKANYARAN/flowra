// @vitest-environment jsdom
// Render test for the role home dashboard: it loads the payload, renders the
// default lens, and switches lenses on click. Charts (recharts) mount inside a
// mocked ResizeObserver — we assert on the framing text + KPI labels, not the SVG.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import HomePage from '@/app/dashboard/page'

// recharts ResponsiveContainer needs ResizeObserver — jsdom lacks it.
class RO { observe() {} unobserve() {} disconnect() {} }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).ResizeObserver = RO

const realFetch = global.fetch
afterEach(() => { cleanup(); global.fetch = realFetch; localStorage.clear() })
beforeEach(() => vi.clearAllMocks())

const PAYLOAD = {
  role: 'admin',
  summary: {
    situation: { composite_score: 72, status: 'healthy', situation_line: 'İyi', components: {} },
    kpis: {
      revenue_mtd_try: 1_200_000, net_income_mtd_try: 180_000, cash_balance_try: 540_000,
      runway_months: 6.2, accounts_receivable_try: 320_000, overdue_receivable_try: 40_000,
      active_alerts: 2, pending_workflows: 1,
    },
    top_alerts: [
      { id: 'a1', severity: 'warning', title: 'Vadesi geçen alacak', detail: '40.000', action_label: null, action_href: '/dashboard/collections', amount_try: 40_000 },
    ],
    partner_strip: [
      { partner_id: 'p1', name: 'Ahmet', share_pct: 60, loan_outstanding_try: 0, burden_score: 0.1, health: 'healthy' },
    ],
    computed_at: '2026-06-06T10:00:00.000Z',
  },
  charts: {
    monthly: Array.from({ length: 12 }, (_, i) => ({ label: 'Ay', ym: `2025-${i + 1}`, revenue: 100000 + i * 1000, expense: 80000, net: 20000 })),
    expenseBreakdown: [{ name: 'Yazılım', value: 50000 }, { name: 'Kira', value: 30000 }],
    topCustomers: [{ name: 'X A.Ş.', value: 200000 }],
    pipeline: { open_count: 3, open_total: 90000, items: [{ id: 'pr1', customer_name: 'Y Ltd', total: 30000, status: 'sent', valid_until: '2026-07-01' }] },
  },
}

function mockOk(payload: unknown) {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('/api/onboarding/status')) {
      return { ok: true, json: async () => ({ status: { steps: [], completed_count: 6, total_count: 6, all_done: true, is_empty: false } }) }
    }
    return { ok: true, json: async () => payload }
  }) as unknown as typeof fetch
}

describe('Role home dashboard', () => {
  it('renders the default (Yönetici) lens for an admin with KPI labels', async () => {
    mockOk(PAYLOAD)
    render(<HomePage />)
    expect(await screen.findByText('Yönetici Kokpiti')).toBeInTheDocument()
    expect(screen.getByText('Gelir (Bu Ay)')).toBeInTheDocument()
    expect(screen.getByText('Nakit Ömrü')).toBeInTheDocument()
    // lens switcher present
    expect(screen.getByRole('button', { name: 'Finans' })).toBeInTheDocument()
  })

  it('switches to the Finans (CFO) lens on click', async () => {
    mockOk(PAYLOAD)
    render(<HomePage />)
    await screen.findByText('Yönetici Kokpiti')
    fireEvent.click(screen.getByRole('button', { name: 'Finans' }))
    expect(await screen.findByText('Finans Kokpiti')).toBeInTheDocument()
    expect(screen.getByText('Gider Dağılımı')).toBeInTheDocument()
  })

  it('switches to the Satış (Sales) lens on click', async () => {
    mockOk(PAYLOAD)
    render(<HomePage />)
    await screen.findByText('Yönetici Kokpiti')
    fireEvent.click(screen.getByRole('button', { name: 'Satış' }))
    expect(await screen.findByText('Satış Kokpiti')).toBeInTheDocument()
    expect(screen.getByText('Açık Teklif')).toBeInTheDocument()
  })

  it('shows the error state on a failed load', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })) as unknown as typeof fetch
    render(<HomePage />)
    expect(await screen.findByText('Kontrol paneli yüklenemedi')).toBeInTheDocument()
  })
})
