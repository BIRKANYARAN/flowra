import { describe, it, expect } from 'vitest'
import { normalizeName, reconcileByName, type NamedParty } from '@/lib/connectors/reconcile-names'

describe('normalizeName — Turkish business names', () => {
  it('strips case, punctuation and common suffixes', () => {
    expect(normalizeName('ABC Teknoloji A.Ş.')).toBe(normalizeName('abc'))
    expect(normalizeName('XYZ Lojistik Ltd. Şti.')).toBe(normalizeName('xyz'))
    expect(normalizeName('  Mavi   İnşaat  ')).toBe('mavi')
    expect(normalizeName('Yıldız Gıda San. ve Tic. A.Ş.')).toBe('yıldız')
  })

  it('matches the same company written differently', () => {
    expect(normalizeName('ABC A.Ş.')).toBe(normalizeName('ABC AS'))
    expect(normalizeName('Demo Müşteri')).toBe(normalizeName('demo müşteri'))
  })
})

describe('reconcileByName — cari ↔ Flowra', () => {
  const accounting: NamedParty[] = [
    { id: 'a1', name: 'ABC Teknoloji A.Ş.' },
    { id: 'a2', name: 'XYZ Lojistik Ltd. Şti.' },
    { id: 'a3', name: 'Yeni Müşteri San. Tic.' },   // not in Flowra
  ]
  const flowra: NamedParty[] = [
    { id: 'f1', name: 'ABC Teknoloji AS' },          // matches a1
    { id: 'f2', name: 'xyz lojistik' },              // matches a2
    { id: 'f3', name: 'Eski Müşteri' },              // not in accounting
  ]

  it('matches across suffix/case differences and reports both gaps', () => {
    const r = reconcileByName(accounting, flowra)
    expect(r.matched.map(m => m.aId).sort()).toEqual(['a1', 'a2'])
    expect(r.onlyInA.map(p => p.id)).toEqual(['a3'])   // accounting has it, Flowra doesn't
    expect(r.onlyInB.map(p => p.id)).toEqual(['f3'])   // Flowra has it, accounting doesn't
    expect(r.matchRate).toBeCloseTo(2 / 3, 3)
  })

  it('consumes each Flowra party at most once', () => {
    const r = reconcileByName(
      [{ id: 'a1', name: 'ABC' }, { id: 'a2', name: 'ABC A.Ş.' }],
      [{ id: 'f1', name: 'ABC' }],
    )
    expect(r.matched).toHaveLength(1)
    expect(r.onlyInA).toHaveLength(1)
  })
})
