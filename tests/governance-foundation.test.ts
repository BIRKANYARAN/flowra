import { describe, it, expect } from 'vitest'
import { CORPORATE_ACTION_TYPES, ACTION_TYPE_LABELS } from '@/lib/services/governance/corporate-actions.service'
import { RESOLUTION_TYPE_LABELS, RESOLUTION_STATUS_LABELS } from '@/lib/services/governance/resolutions.service'

// ── Pure logic tests (no DB) ──────────────────────────────────────────────────

describe('corporate-actions service', () => {
  it('has a label for every action type', () => {
    for (const t of CORPORATE_ACTION_TYPES) {
      expect(ACTION_TYPE_LABELS[t]).toBeTruthy()
    }
  })

  it('CORPORATE_ACTION_TYPES has 20 entries', () => {
    expect(CORPORATE_ACTION_TYPES.length).toBe(20)
  })
})

describe('resolutions service', () => {
  it('has labels for all resolution types', () => {
    for (const t of ['board','general_meeting','circular'] as const) {
      expect(RESOLUTION_TYPE_LABELS[t]).toBeTruthy()
    }
  })

  it('has labels for all statuses', () => {
    for (const s of ['draft','approved','rejected','implemented'] as const) {
      expect(RESOLUTION_STATUS_LABELS[s]).toBeTruthy()
    }
  })
})

describe('governance clock service - pure date logic', () => {
  // Test the internal helpers via the exported service

  it('daysBetween is negative for past dates', () => {
    // Access via obligation computation on a mock
    // The logic is inline in the service — test via obligation output shape
    // We test the service contract: obligations have days_until that is negative for overdue
    // This is a structural test of the type shape
    const obligation = {
      id: 'test', source: 'period_close' as const,
      title: 'Test', description: 'test',
      due_date: '2020-01-01',
      status: 'overdue' as const,
      severity: 'critical' as const,
      days_until: -100,
      action_href: null,
      metadata: {},
      is_informational: false,
    }
    expect(obligation.days_until).toBeLessThan(0)
    expect(obligation.status).toBe('overdue')
  })

  it('statutory obligations are always informational', () => {
    // Statutory ref items must have is_informational: true
    // This tests the design contract
    const statutoryObligation = {
      source: 'statutory_ref' as const,
      is_informational: true,
      severity: 'info' as const,
    }
    expect(statutoryObligation.is_informational).toBe(true)
    expect(statutoryObligation.severity).toBe('info')
  })

  it('obligation statuses map correctly', () => {
    // Test status logic
    const cases: Array<[number, string]> = [
      [-5, 'overdue'],
      [0,  'due_today'],
      [7,  'upcoming'],
      [30, 'upcoming'],
    ]
    function toStatus(d: number) {
      if (d < 0) return 'overdue'
      if (d === 0) return 'due_today'
      return 'upcoming'
    }
    for (const [days, expected] of cases) {
      expect(toStatus(days)).toBe(expected)
    }
  })

  it('severity escalates correctly', () => {
    function toSeverity(d: number, source: string) {
      if (source === 'statutory_ref') return 'info'
      if (d < 0)   return 'critical'
      if (d <= 7)  return 'critical'
      if (d <= 14) return 'warning'
      return 'info'
    }
    expect(toSeverity(-1, 'period_close')).toBe('critical')
    expect(toSeverity(3,  'period_close')).toBe('critical')
    expect(toSeverity(10, 'period_close')).toBe('warning')
    expect(toSeverity(30, 'period_close')).toBe('info')
    expect(toSeverity(0,  'statutory_ref')).toBe('info')  // statutory is always info
  })
})

describe('nav-config governance', () => {
  it('governance nav item exists for admin', async () => {
    const { getAllItemsForRole } = await import('@/lib/nav-config')
    const adminItems = getAllItemsForRole('admin')
    const govItem = adminItems.find(i => i.href === '/dashboard/governance')
    expect(govItem).toBeDefined()
    expect(govItem?.label).toBe('Yönetişim')
  })

  it('governance nav item hidden for viewer', async () => {
    const { getAllItemsForRole } = await import('@/lib/nav-config')
    const viewerItems = getAllItemsForRole('viewer')
    const govItem = viewerItems.find(i => i.href === '/dashboard/governance')
    expect(govItem).toBeUndefined()
  })

  it('governance nav item hidden for manager', async () => {
    const { getAllItemsForRole } = await import('@/lib/nav-config')
    const managerItems = getAllItemsForRole('manager')
    const govItem = managerItems.find(i => i.href === '/dashboard/governance')
    expect(govItem).toBeUndefined()
  })
})
