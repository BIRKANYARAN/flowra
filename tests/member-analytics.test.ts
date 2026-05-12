/**
 * FAZ 14 — Ekip Yönetimi: business-logic unit tests
 *
 * Tests the pure analytics functions in admin/users/page.tsx:
 *   1. activeMembers()     — members where accepted_at is not null
 *   2. pendingMembers()    — members where accepted_at is null
 *   3. roleDistribution()  — counts per role for active members only
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/member-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from admin/users/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

type MemberRole = 'admin' | 'manager' | 'viewer'

interface MemberStub {
  id:           string
  role:         MemberRole
  accepted_at:  string | null
}

function activeMembers(members: MemberStub[]): MemberStub[] {
  return members.filter(m => m.accepted_at !== null)
}

function pendingMembers(members: MemberStub[]): MemberStub[] {
  return members.filter(m => m.accepted_at === null)
}

function roleDistribution(members: MemberStub[]): Record<MemberRole, number> {
  const counts: Record<MemberRole, number> = { admin: 0, manager: 0, viewer: 0 }
  for (const m of members) {
    if (m.accepted_at !== null) {
      counts[m.role] = (counts[m.role] ?? 0) + 1
    }
  }
  return counts
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let _id = 0
function makeMember(overrides: Partial<MemberStub> = {}): MemberStub {
  return {
    id:          String(++_id),
    role:        'viewer',
    accepted_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. activeMembers
// ─────────────────────────────────────────────────────────────────────────────

describe('activeMembers()', () => {
  it('returns empty array for no members', () => {
    expect(activeMembers([])).toEqual([])
  })

  it('returns members with non-null accepted_at', () => {
    const members = [
      makeMember({ accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ accepted_at: null }),
      makeMember({ accepted_at: '2024-03-15T00:00:00Z' }),
    ]
    expect(activeMembers(members)).toHaveLength(2)
  })

  it('returns empty when all are pending', () => {
    const members = [
      makeMember({ accepted_at: null }),
      makeMember({ accepted_at: null }),
    ]
    expect(activeMembers(members)).toHaveLength(0)
  })

  it('returns all when all have accepted_at', () => {
    const members = [
      makeMember({ accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ accepted_at: '2024-06-01T00:00:00Z' }),
    ]
    expect(activeMembers(members)).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. pendingMembers
// ─────────────────────────────────────────────────────────────────────────────

describe('pendingMembers()', () => {
  it('returns empty array for no members', () => {
    expect(pendingMembers([])).toEqual([])
  })

  it('returns members with null accepted_at', () => {
    const members = [
      makeMember({ accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ accepted_at: null }),
      makeMember({ accepted_at: null }),
    ]
    expect(pendingMembers(members)).toHaveLength(2)
  })

  it('returns empty when all are active', () => {
    const members = [
      makeMember({ accepted_at: '2024-01-01T00:00:00Z' }),
    ]
    expect(pendingMembers(members)).toHaveLength(0)
  })

  it('activeMembers + pendingMembers covers all members', () => {
    const members = [
      makeMember({ accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ accepted_at: null }),
      makeMember({ accepted_at: '2024-06-01T00:00:00Z' }),
      makeMember({ accepted_at: null }),
    ]
    expect(activeMembers(members).length + pendingMembers(members).length).toBe(members.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. roleDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe('roleDistribution()', () => {
  it('returns zeroes for empty members', () => {
    const d = roleDistribution([])
    expect(d.admin).toBe(0)
    expect(d.manager).toBe(0)
    expect(d.viewer).toBe(0)
  })

  it('counts active members by role', () => {
    const members = [
      makeMember({ role: 'admin',   accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'manager', accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'manager', accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'viewer',  accepted_at: '2024-01-01T00:00:00Z' }),
    ]
    const d = roleDistribution(members)
    expect(d.admin).toBe(1)
    expect(d.manager).toBe(2)
    expect(d.viewer).toBe(1)
  })

  it('does NOT count pending members in role distribution', () => {
    const members = [
      makeMember({ role: 'admin',   accepted_at: null }),   // pending — not counted
      makeMember({ role: 'manager', accepted_at: '2024-01-01T00:00:00Z' }),
    ]
    const d = roleDistribution(members)
    expect(d.admin).toBe(0)    // pending admin not counted
    expect(d.manager).toBe(1)
  })

  it('all admins — manager and viewer are zero', () => {
    const members = [
      makeMember({ role: 'admin', accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'admin', accepted_at: '2024-01-01T00:00:00Z' }),
    ]
    const d = roleDistribution(members)
    expect(d.admin).toBe(2)
    expect(d.manager).toBe(0)
    expect(d.viewer).toBe(0)
  })

  it('total of all role counts equals active member count', () => {
    const members = [
      makeMember({ role: 'admin',   accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'manager', accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'viewer',  accepted_at: '2024-01-01T00:00:00Z' }),
      makeMember({ role: 'viewer',  accepted_at: null }),               // pending
    ]
    const d = roleDistribution(members)
    const total = d.admin + d.manager + d.viewer
    expect(total).toBe(activeMembers(members).length)
  })
})
