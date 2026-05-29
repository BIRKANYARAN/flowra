/**
 * Tests for proforma snapshot rendering logic
 * Validates that snapshot data is preferred over live data
 * Run with: npx vitest run tests/snapshot-rendering.test.ts
 */
import { describe, it, expect } from 'vitest'

// Simulate the snapshot preference logic used in both private and public pages
function resolveCompany(
  proforma: { company_snapshot?: Record<string, string> | null },
  liveSettings: { company_name?: string; address?: string } | null
) {
  const cs = proforma.company_snapshot
  if (cs) {
    return {
      name:    cs.name ?? '',
      address: cs.address ?? '',
    }
  }
  if (liveSettings) {
    return {
      name:    liveSettings.company_name ?? '',
      address: liveSettings.address ?? '',
    }
  }
  return { name: '', address: '' }
}

function resolveCustomer(
  proforma: { customer_snapshot?: Record<string, string> | null; customer_name?: string },
  liveCustomer: { name?: string; address?: string } | null
) {
  const cus = proforma.customer_snapshot
  if (cus) {
    return {
      name:    cus.name ?? '',
      address: cus.address ?? '',
    }
  }
  if (liveCustomer) {
    return {
      name:    liveCustomer.name ?? proforma.customer_name ?? '',
      address: liveCustomer.address ?? '',
    }
  }
  return { name: proforma.customer_name ?? '', address: '' }
}

describe('Proforma Snapshot Rendering', () => {
  it('prefers company snapshot over live settings', () => {
    const proforma = {
      company_snapshot: { name: 'Frozen Corp', address: 'Old Address' },
    }
    const liveSettings = { company_name: 'Updated Corp', address: 'New Address' }

    const result = resolveCompany(proforma, liveSettings)
    expect(result.name).toBe('Frozen Corp')
    expect(result.address).toBe('Old Address')
  })

  it('falls back to live settings for old proformas without snapshot', () => {
    const proforma = { company_snapshot: null }
    const liveSettings = { company_name: 'Live Corp', address: 'Live Addr' }

    const result = resolveCompany(proforma, liveSettings)
    expect(result.name).toBe('Live Corp')
  })

  it('prefers customer snapshot over live customer', () => {
    const proforma = {
      customer_snapshot: { name: 'Frozen Customer', address: 'Snapshot Addr' },
      customer_name: 'Header Name',
    }
    const liveCustomer = { name: 'Updated Customer', address: 'Updated Addr' }

    const result = resolveCustomer(proforma, liveCustomer)
    expect(result.name).toBe('Frozen Customer')
    expect(result.address).toBe('Snapshot Addr')
  })

  it('falls back to customer_name when no snapshot and no live customer', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Fallback Name' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('Fallback Name')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — extended edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — edge cases', () => {
  it('returns empty strings when both snapshot and live settings are absent', () => {
    const result = resolveCompany({ company_snapshot: null }, null)
    expect(result.name).toBe('')
    expect(result.address).toBe('')
  })

  it('snapshot with missing name key falls back to empty string', () => {
    const proforma = { company_snapshot: { address: 'Some Addr' } as Record<string, string> }
    const result = resolveCompany(proforma, null)
    expect(result.name).toBe('')
    expect(result.address).toBe('Some Addr')
  })

  it('snapshot with missing address key falls back to empty string', () => {
    const proforma = { company_snapshot: { name: 'Corp' } as Record<string, string> }
    const result = resolveCompany(proforma, null)
    expect(result.name).toBe('Corp')
    expect(result.address).toBe('')
  })

  it('live settings with missing company_name falls back to empty string', () => {
    const result = resolveCompany({ company_snapshot: null }, { address: 'Some St' })
    expect(result.name).toBe('')
    expect(result.address).toBe('Some St')
  })

  it('live settings with missing address falls back to empty string', () => {
    const result = resolveCompany({ company_snapshot: null }, { company_name: 'TechCo' })
    expect(result.name).toBe('TechCo')
    expect(result.address).toBe('')
  })

  it('snapshot takes priority even when live settings have richer data', () => {
    const proforma = { company_snapshot: { name: 'Old Name', address: '' } }
    const live = { company_name: 'New Name', address: 'New Address' }
    const result = resolveCompany(proforma, live)
    // Snapshot wins — even though address is empty
    expect(result.name).toBe('Old Name')
    expect(result.address).toBe('')
  })

  it('snapshot with empty name returns empty string, not live name', () => {
    const proforma = { company_snapshot: { name: '', address: 'Snap Addr' } }
    const live = { company_name: 'Live Corp', address: 'Live Addr' }
    const result = resolveCompany(proforma, live)
    // Snapshot wins entire branch
    expect(result.name).toBe('')
  })

  it('undefined company_snapshot is treated as no snapshot (falls to live)', () => {
    const proforma = {} // no company_snapshot key
    const live = { company_name: 'Default Corp', address: '123 St' }
    const result = resolveCompany(proforma, live)
    expect(result.name).toBe('Default Corp')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — extended edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — edge cases', () => {
  it('returns empty strings when no snapshot, no live customer, and no customer_name', () => {
    const result = resolveCustomer({ customer_snapshot: null }, null)
    expect(result.name).toBe('')
    expect(result.address).toBe('')
  })

  it('live customer name takes priority over customer_name fallback', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Header Name' }
    const live = { name: 'Live Customer Name', address: 'Live Addr' }
    const result = resolveCustomer(proforma, live)
    expect(result.name).toBe('Live Customer Name')
  })

  it('customer_name is used when live customer name is missing', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Header Name' }
    const live = { address: 'Some Addr' } // name missing
    const result = resolveCustomer(proforma, live)
    expect(result.name).toBe('Header Name')
  })

  it('live customer address is returned when no snapshot', () => {
    const proforma = { customer_snapshot: null, customer_name: 'X' }
    const live = { name: 'Live', address: 'Business St 5' }
    const result = resolveCustomer(proforma, live)
    expect(result.address).toBe('Business St 5')
  })

  it('customer snapshot address overrides live address', () => {
    const proforma = {
      customer_snapshot: { name: 'Snap', address: 'Snapshot St' },
      customer_name: 'H',
    }
    const live = { name: 'Live', address: 'Live St' }
    const result = resolveCustomer(proforma, live)
    expect(result.address).toBe('Snapshot St')
  })

  it('undefined customer_snapshot behaves as no snapshot', () => {
    const proforma = { customer_name: 'Direct Name' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('Direct Name')
  })

  it('empty string customer_name falls back to empty string', () => {
    const proforma = { customer_snapshot: null, customer_name: '' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot immutability — verifies that live data changes after proforma
// creation do not retroactively alter historical proformas
// ─────────────────────────────────────────────────────────────────────────────

describe('Snapshot immutability contract', () => {
  it('company renaming does not affect proforma created before the rename', () => {
    // Proforma was created when company was named "Original Inc"
    const proforma = {
      company_snapshot: { name: 'Original Inc', address: 'Original Addr' },
    }
    // After rename, live settings say the company is "Renamed Inc"
    const currentLive = { company_name: 'Renamed Inc', address: 'New HQ' }

    const result = resolveCompany(proforma, currentLive)
    expect(result.name).toBe('Original Inc')
  })

  it('customer address change does not affect historical proforma display', () => {
    const proforma = {
      customer_snapshot: { name: 'Customer Ltd', address: 'Old Office' },
    }
    const currentLive = { name: 'Customer Ltd', address: 'New Office' }

    const result = resolveCustomer(proforma, currentLive)
    expect(result.address).toBe('Old Office')
  })

  it('both company and customer snapshots are independently frozen', () => {
    const companySS = { name: 'Frozen Company', address: 'Frozen Addr' }
    const customerSS = { name: 'Frozen Customer', address: 'Customer Frozen Addr' }

    const proformaForCompany = { company_snapshot: companySS }
    const proformaForCustomer = { customer_snapshot: customerSS, customer_name: 'Header' }

    const companyResult  = resolveCompany(proformaForCompany, { company_name: 'New', address: 'New' })
    const customerResult = resolveCustomer(proformaForCustomer, { name: 'New Customer', address: 'New Addr' })

    expect(companyResult.name).toBe('Frozen Company')
    expect(customerResult.name).toBe('Frozen Customer')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Return type consistency — both resolvers always return { name, address }
// ─────────────────────────────────────────────────────────────────────────────

describe('Return type consistency', () => {
  it('resolveCompany always returns an object with name and address keys', () => {
    const cases = [
      [{ company_snapshot: { name: 'A', address: 'B' } }, null],
      [{ company_snapshot: null }, { company_name: 'A', address: 'B' }],
      [{ company_snapshot: null }, null],
    ] as const

    for (const [proforma, live] of cases) {
      const result = resolveCompany(proforma, live as any)
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('address')
    }
  })

  it('resolveCustomer always returns an object with name and address keys', () => {
    const cases = [
      [{ customer_snapshot: { name: 'A', address: 'B' } }, null],
      [{ customer_snapshot: null, customer_name: 'A' }, null],
      [{ customer_snapshot: null }, { name: 'A', address: 'B' }],
    ] as const

    for (const [proforma, live] of cases) {
      const result = resolveCustomer(proforma as any, live as any)
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('address')
    }
  })

  it('all returned values are strings, never null or undefined', () => {
    const r1 = resolveCompany({ company_snapshot: null }, null)
    const r2 = resolveCustomer({ customer_snapshot: null }, null)

    expect(typeof r1.name).toBe('string')
    expect(typeof r1.address).toBe('string')
    expect(typeof r2.name).toBe('string')
    expect(typeof r2.address).toBe('string')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — snapshot address fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — snapshot address fallback', () => {
  it('snapshot missing address key falls back to empty string', () => {
    const proforma = { company_snapshot: { name: 'SnapCorp' } as Record<string, string> }
    const result = resolveCompany(proforma, { company_name: 'Live Corp', address: 'Live St' })
    expect(result.address).toBe('')
  })

  it('snapshot with explicit empty address returns empty string, not live address', () => {
    const proforma = { company_snapshot: { name: 'Corp', address: '' } }
    const result = resolveCompany(proforma, { company_name: 'X', address: 'Real Addr' })
    expect(result.address).toBe('')
  })

  it('snapshot address with whitespace is preserved as-is', () => {
    const proforma = { company_snapshot: { name: 'Corp', address: '  ' } }
    const result = resolveCompany(proforma, null)
    expect(result.address).toBe('  ')
  })

  it('snapshot address with special characters preserved', () => {
    const proforma = { company_snapshot: { name: 'Corp', address: 'İstanbul, Türkiye' } }
    const result = resolveCompany(proforma, null)
    expect(result.address).toBe('İstanbul, Türkiye')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — snapshot name empty string
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — snapshot name empty string', () => {
  it('snapshot.name = "" returns "" not live data', () => {
    const proforma = { company_snapshot: { name: '', address: 'Some Addr' } }
    const live = { company_name: 'Live Corp', address: 'Live Addr' }
    const result = resolveCompany(proforma, live)
    expect(result.name).toBe('')
  })

  it('snapshot.name = "" with null live returns empty string', () => {
    const proforma = { company_snapshot: { name: '', address: '' } }
    const result = resolveCompany(proforma, null)
    expect(result.name).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — null snapshot, null live settings
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — null snapshot, null live settings', () => {
  it('both null → returns {name: "", address: ""}', () => {
    const result = resolveCompany({ company_snapshot: null }, null)
    expect(result).toEqual({ name: '', address: '' })
  })

  it('undefined snapshot, null live → returns {name: "", address: ""}', () => {
    const result = resolveCompany({}, null)
    expect(result).toEqual({ name: '', address: '' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — all fields from snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — all fields from snapshot', () => {
  it('snapshot has both name and address — both returned', () => {
    const proforma = { company_snapshot: { name: 'SnapCo', address: 'Snap St 42' } }
    const result = resolveCompany(proforma, { company_name: 'Other', address: 'Other Addr' })
    expect(result.name).toBe('SnapCo')
    expect(result.address).toBe('Snap St 42')
  })

  it('snapshot fields win over richer live settings', () => {
    const proforma = { company_snapshot: { name: 'A', address: 'B' } }
    const live = { company_name: 'Longer Name Corp', address: 'Detailed Address Block 123' }
    const result = resolveCompany(proforma, live)
    expect(result.name).toBe('A')
    expect(result.address).toBe('B')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — all snapshot fields used
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — all snapshot fields used', () => {
  it('customer_snapshot provides name and address — both returned', () => {
    const proforma = {
      customer_snapshot: { name: 'Snap Customer', address: 'Snap Customer Addr' },
      customer_name: 'Header',
    }
    const result = resolveCustomer(proforma, { name: 'Live Customer', address: 'Live Addr' })
    expect(result.name).toBe('Snap Customer')
    expect(result.address).toBe('Snap Customer Addr')
  })

  it('customer snapshot with empty name returns empty string', () => {
    const proforma = {
      customer_snapshot: { name: '', address: 'Some Addr' },
      customer_name: 'Fallback',
    }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — customer_name fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — customer_name fallback', () => {
  it('no snapshot, no live, but customer_name exists → customer_name returned', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Proforma Name' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('Proforma Name')
    expect(result.address).toBe('')
  })

  it('customer_name is ignored when snapshot is present', () => {
    const proforma = {
      customer_snapshot: { name: 'Snap Name', address: '' },
      customer_name: 'Proforma Name',
    }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('Snap Name')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — live settings address fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — live settings address fallback', () => {
  it('no snapshot, live settings has address → returned', () => {
    const proforma = { customer_snapshot: null, customer_name: 'X' }
    const live = { name: 'Live', address: 'Live Address 99' }
    const result = resolveCustomer(proforma, live)
    expect(result.address).toBe('Live Address 99')
  })

  it('no snapshot, live has no address → empty string', () => {
    const proforma = { customer_snapshot: null, customer_name: 'X' }
    const live = { name: 'Live' }
    const result = resolveCustomer(proforma, live)
    expect(result.address).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — empty snapshot object
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — empty snapshot object', () => {
  it('snapshot is {} → name falls back to empty string, address to empty string', () => {
    const proforma = {
      customer_snapshot: {} as Record<string, string>,
      customer_name: 'Should Not Win',
    }
    const live = { name: 'Live Name', address: 'Live Addr' }
    // snapshot object is truthy, so its undefined fields fall back to ''
    const result = resolveCustomer(proforma, live)
    expect(result.name).toBe('')
    expect(result.address).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Type safety — both resolvers always return { name: string, address: string }
// ─────────────────────────────────────────────────────────────────────────────

describe('Type safety — resolvers always return string fields', () => {
  it('resolveCompany with snapshot returns string name', () => {
    const r = resolveCompany({ company_snapshot: { name: 'A', address: 'B' } }, null)
    expect(typeof r.name).toBe('string')
  })

  it('resolveCompany with null snapshot returns string name', () => {
    const r = resolveCompany({ company_snapshot: null }, null)
    expect(typeof r.name).toBe('string')
  })

  it('resolveCompany with live settings returns string address', () => {
    const r = resolveCompany({ company_snapshot: null }, { company_name: 'C', address: 'D' })
    expect(typeof r.address).toBe('string')
  })

  it('resolveCustomer with snapshot returns string address', () => {
    const r = resolveCustomer({ customer_snapshot: { name: 'X', address: 'Y' } }, null)
    expect(typeof r.address).toBe('string')
  })

  it('resolveCustomer with no data returns string name', () => {
    const r = resolveCustomer({ customer_snapshot: null }, null)
    expect(typeof r.name).toBe('string')
  })

  it('resolveCompany result keys are exactly name and address', () => {
    const r = resolveCompany({ company_snapshot: null }, null)
    expect(Object.keys(r).sort()).toEqual(['address', 'name'])
  })

  it('resolveCustomer result keys are exactly name and address', () => {
    const r = resolveCustomer({ customer_snapshot: null }, null)
    expect(Object.keys(r).sort()).toEqual(['address', 'name'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Priority invariant — snapshot ALWAYS wins over live data when both present
// ─────────────────────────────────────────────────────────────────────────────

describe('Priority invariant — snapshot always beats live data', () => {
  it('1. company snapshot name wins over live company_name', () => {
    const r = resolveCompany({ company_snapshot: { name: 'S', address: '' } }, { company_name: 'L', address: '' })
    expect(r.name).toBe('S')
  })

  it('2. company snapshot address wins over live address', () => {
    const r = resolveCompany({ company_snapshot: { name: '', address: 'S-Addr' } }, { company_name: '', address: 'L-Addr' })
    expect(r.address).toBe('S-Addr')
  })

  it('3. customer snapshot name wins over live name', () => {
    const r = resolveCustomer({ customer_snapshot: { name: 'S-Cust', address: '' } }, { name: 'L-Cust', address: '' })
    expect(r.name).toBe('S-Cust')
  })

  it('4. customer snapshot address wins over live address', () => {
    const r = resolveCustomer({ customer_snapshot: { name: '', address: 'S-CustAddr' } }, { name: '', address: 'L-CustAddr' })
    expect(r.address).toBe('S-CustAddr')
  })

  it('5. customer snapshot wins over customer_name fallback', () => {
    const r = resolveCustomer({ customer_snapshot: { name: 'SnapshotName', address: '' }, customer_name: 'FallbackName' }, null)
    expect(r.name).toBe('SnapshotName')
  })

  it('6. company snapshot beats live even when snapshot has empty values', () => {
    const r = resolveCompany({ company_snapshot: { name: '', address: '' } }, { company_name: 'Real Corp', address: 'Real Addr' })
    expect(r.name).toBe('')
    expect(r.address).toBe('')
  })

  it('7. customer snapshot beats all other sources when fully populated', () => {
    const r = resolveCustomer(
      { customer_snapshot: { name: 'Snap', address: 'SnapAddr' }, customer_name: 'Header' },
      { name: 'Live', address: 'LiveAddr' }
    )
    expect(r.name).toBe('Snap')
    expect(r.address).toBe('SnapAddr')
  })

  it('8. live data only used when snapshot is null', () => {
    const r = resolveCompany({ company_snapshot: null }, { company_name: 'FallbackCorp', address: 'FB Addr' })
    expect(r.name).toBe('FallbackCorp')
    expect(r.address).toBe('FB Addr')
  })

  it('9. live data only used for customer when snapshot is null', () => {
    const r = resolveCustomer({ customer_snapshot: null, customer_name: 'Header' }, { name: 'Live', address: 'Live Addr' })
    expect(r.name).toBe('Live')
    expect(r.address).toBe('Live Addr')
  })

  it('10. snapshot with single-char values still wins over rich live data', () => {
    const r = resolveCompany(
      { company_snapshot: { name: 'X', address: 'Y' } },
      { company_name: 'Very Long Company Name', address: 'Very Long Address Street 123 Istanbul Turkey' }
    )
    expect(r.name).toBe('X')
    expect(r.address).toBe('Y')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — comprehensive fallback chain
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — comprehensive fallback chain', () => {
  it('priority: snapshot > live settings > empty strings', () => {
    // snapshot present → use snapshot
    const r1 = resolveCompany({ company_snapshot: { name: 'S', address: 'SA' } }, { company_name: 'L', address: 'LA' })
    expect(r1.name).toBe('S')
    expect(r1.address).toBe('SA')

    // snapshot absent → use live
    const r2 = resolveCompany({ company_snapshot: null }, { company_name: 'L', address: 'LA' })
    expect(r2.name).toBe('L')
    expect(r2.address).toBe('LA')

    // both absent → empty strings
    const r3 = resolveCompany({ company_snapshot: null }, null)
    expect(r3.name).toBe('')
    expect(r3.address).toBe('')
  })

  it('snapshot with only name field — address falls back to empty, not live', () => {
    const r = resolveCompany(
      { company_snapshot: { name: 'Corp Only' } as Record<string, string> },
      { company_name: 'X', address: 'Some address' }
    )
    expect(r.name).toBe('Corp Only')
    expect(r.address).toBe('')
  })

  it('live company_name undefined → empty string name', () => {
    const r = resolveCompany({ company_snapshot: null }, { address: 'Addr' })
    expect(r.name).toBe('')
    expect(r.address).toBe('Addr')
  })

  it('live address undefined → empty string address', () => {
    const r = resolveCompany({ company_snapshot: null }, { company_name: 'Corp' })
    expect(r.name).toBe('Corp')
    expect(r.address).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — comprehensive fallback chain
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — comprehensive fallback chain', () => {
  it('priority: snapshot > live customer > customer_name > empty strings', () => {
    // snapshot present
    const r1 = resolveCustomer(
      { customer_snapshot: { name: 'SN', address: 'SA' }, customer_name: 'H' },
      { name: 'LN', address: 'LA' }
    )
    expect(r1.name).toBe('SN')
    expect(r1.address).toBe('SA')

    // no snapshot, live customer present
    const r2 = resolveCustomer(
      { customer_snapshot: null, customer_name: 'H' },
      { name: 'LN', address: 'LA' }
    )
    expect(r2.name).toBe('LN')
    expect(r2.address).toBe('LA')

    // no snapshot, no live, customer_name
    const r3 = resolveCustomer({ customer_snapshot: null, customer_name: 'H' }, null)
    expect(r3.name).toBe('H')
    expect(r3.address).toBe('')

    // no snapshot, no live, no customer_name
    const r4 = resolveCustomer({ customer_snapshot: null }, null)
    expect(r4.name).toBe('')
    expect(r4.address).toBe('')
  })

  it('live customer with only address (no name) → customer_name as name', () => {
    const r = resolveCustomer(
      { customer_snapshot: null, customer_name: 'Fallback' },
      { address: 'Addr Only' }
    )
    expect(r.name).toBe('Fallback')
    expect(r.address).toBe('Addr Only')
  })

  it('snapshot with only address field — name falls back to empty string', () => {
    const r = resolveCustomer(
      { customer_snapshot: { address: 'SnapAddr' } as Record<string, string>, customer_name: 'H' },
      { name: 'Live', address: 'LiveAddr' }
    )
    expect(r.name).toBe('')
    expect(r.address).toBe('SnapAddr')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Both resolvers — return object shape and immutability
// ─────────────────────────────────────────────────────────────────────────────

describe('Both resolvers — return object immutability', () => {
  it('modifying returned object does not affect subsequent calls', () => {
    const proforma = { company_snapshot: { name: 'Corp', address: 'Addr' } }
    const r1 = resolveCompany(proforma, null)
    // Mutate the returned object
    ;(r1 as any).name = 'MUTATED'
    // Call again — should return original snapshot data
    const r2 = resolveCompany(proforma, null)
    expect(r2.name).toBe('Corp')
  })

  it('resolveCompany called twice on same proforma returns consistent results', () => {
    const proforma = { company_snapshot: { name: 'Stable Corp', address: 'Stable Addr' } }
    const r1 = resolveCompany(proforma, null)
    const r2 = resolveCompany(proforma, null)
    expect(r1.name).toBe(r2.name)
    expect(r1.address).toBe(r2.address)
  })

  it('resolveCustomer called twice on same proforma returns consistent results', () => {
    const proforma = { customer_snapshot: { name: 'Stable Cust', address: 'Stable CustAddr' }, customer_name: 'H' }
    const r1 = resolveCustomer(proforma, null)
    const r2 = resolveCustomer(proforma, null)
    expect(r1.name).toBe(r2.name)
    expect(r1.address).toBe(r2.address)
  })
})
