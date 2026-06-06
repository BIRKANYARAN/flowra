// @vitest-environment jsdom
// Render test for OnboardingChecklist: it shows steps + progress when setup is
// incomplete, and renders nothing once every step is done.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'

const realFetch = global.fetch
afterEach(() => { cleanup(); global.fetch = realFetch; sessionStorage.clear() })
beforeEach(() => vi.clearAllMocks())

function mockStatus(status: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status }),
  })) as unknown as typeof fetch
}

const INCOMPLETE = {
  is_empty: true,
  completed_count: 1,
  total_count: 6,
  all_done: false,
  steps: [
    { key: 'company_profile', label: 'Şirket bilgilerini tamamla', description: 'd', href: '/dashboard/settings', done: true },
    { key: 'first_sale',      label: 'İlk satışı kaydet',          description: 'd', href: '/dashboard/sales',    done: false },
  ],
}

describe('OnboardingChecklist', () => {
  it('renders the welcome heading, progress and steps when setup is incomplete', async () => {
    mockStatus(INCOMPLETE)
    render(<OnboardingChecklist />)
    expect(await screen.findByText(/hoş geldiniz/i)).toBeInTheDocument()
    expect(screen.getByText('1 / 6 adım tamamlandı')).toBeInTheDocument()
    expect(screen.getByText('İlk satışı kaydet')).toBeInTheDocument()
    // The incomplete step deep-links to its screen.
    const link = screen.getByText('İlk satışı kaydet').closest('a')
    expect(link).toHaveAttribute('href', '/dashboard/sales')
  })

  it('renders nothing once every step is done', async () => {
    mockStatus({ ...INCOMPLETE, completed_count: 6, all_done: true })
    const { container } = render(<OnboardingChecklist />)
    // Give the effect a tick; component must stay empty.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('does not crash when the status fetch fails', async () => {
    global.fetch = vi.fn(async () => { throw new Error('boom') }) as unknown as typeof fetch
    const { container } = render(<OnboardingChecklist />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
