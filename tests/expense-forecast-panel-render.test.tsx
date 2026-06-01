// @vitest-environment jsdom
// Characterization test for ExpenseForecastPanel, extracted from BudgetTab.tsx.
// Uses the reusable renderWithQuery helper (TanStack Query harness). Proves the
// extracted panel mounts, fetches the correct endpoint, and renders its error
// path — the render-level safety net for the split.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { renderWithQuery } from './_helpers/render-with-query'
import { ExpenseForecastPanel } from '@/app/dashboard/planning/_tabs/_budget/ExpenseForecastPanel'

const realFetch = global.fetch
afterEach(() => { cleanup(); global.fetch = realFetch })
beforeEach(() => vi.clearAllMocks())

describe('ExpenseForecastPanel (extracted from BudgetTab) — characterization', () => {
  it('mounts and fetches the expense-forecast endpoint', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('x') }) as unknown as typeof fetch
    global.fetch = fetchMock
    renderWithQuery(<ExpenseForecastPanel />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/finance/expense-forecast')
  })

  it('renders the error state (with retry) when the fetch fails — no crash post-extraction', async () => {
    global.fetch = vi.fn(async () => { throw new Error('boom') }) as unknown as typeof fetch
    renderWithQuery(<ExpenseForecastPanel />)
    expect(await screen.findByText(/Gider tahmini yüklenemedi/)).toBeInTheDocument()
    expect(screen.getByText('Yeniden Dene')).toBeInTheDocument()
  })
})
