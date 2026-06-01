// @vitest-environment jsdom
// Characterization test for the VadeTakvimi component extracted from
// AmortizationTab.tsx. Proves the extraction preserved behavior: the component
// mounts, its data hook fires against the correct endpoint, and its error render
// path works — the render-level safety net the component split required.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { VadeTakvimi } from '@/app/dashboard/partners/_components/_amortization/VadeTakvimi'

const realFetch = global.fetch
afterEach(() => { cleanup(); global.fetch = realFetch })
beforeEach(() => vi.clearAllMocks())

describe('VadeTakvimi (extracted from AmortizationTab) — characterization', () => {
  it('mounts and fetches the correct debt-maturity endpoint on load', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('x') }) as unknown as typeof fetch
    global.fetch = fetchMock
    render(<VadeTakvimi />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/partners/debt-maturity')
  })

  it('renders the error state when the fetch fails (no crash post-extraction)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('Vade servisi hatası') }) as unknown as typeof fetch
    render(<VadeTakvimi />)
    expect(await screen.findByText('Vade servisi hatası')).toBeInTheDocument()
  })
})
