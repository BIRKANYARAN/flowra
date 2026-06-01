// @vitest-environment jsdom
// WCAG guard for navigation: the active item must be programmatically identifiable
// (aria-current), not signalled by colour alone (WCAG 1.4.1/4.1.2). Renders the
// shared UnifiedTabNav (a pure server component, prop-driven) and asserts the
// active tab carries aria-current and inactive tabs do not.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { UnifiedTabNav } from '@/app/dashboard/_shared/UnifiedTabNav'

afterEach(() => cleanup())

const tabs = [
  { key: 'pnl', label: 'Kâr/Zarar' },
  { key: 'balance', label: 'Bilanço' },
  { key: 'cash', label: 'Nakit' },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any

describe('UnifiedTabNav accessibility', () => {
  it('marks the active tab with aria-current=page and leaves others unset', () => {
    render(<UnifiedTabNav tabs={tabs} activeTab="balance" basePath="/dashboard/finance" />)
    const active = screen.getByText('Bilanço').closest('a')!
    const inactive = screen.getByText('Kâr/Zarar').closest('a')!
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(inactive).not.toHaveAttribute('aria-current')
  })

  it('wraps tabs in a labelled <nav> landmark', () => {
    render(<UnifiedTabNav tabs={tabs} activeTab="pnl" basePath="/dashboard/finance" />)
    expect(screen.getByRole('navigation', { name: 'Sekmeler' })).toBeInTheDocument()
  })
})
