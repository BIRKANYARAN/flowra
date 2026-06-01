// Node-env tests for the remaining pure forecasting helpers in
// revenue-forecast.service.ts: the weighted blend engine and the month label.
import { describe, it, expect } from 'vitest'
import { computeBlendedForecast, monthLabel } from '@/lib/services/finance/revenue-forecast.service'

describe('computeBlendedForecast (weighted trend/seasonal/pipeline blend)', () => {
  it('high R² + strong seasonality → 40/40/20 weights', () => {
    // 0.4×1000 + 0.4×1200 + 0.2×800 = 1040
    expect(computeBlendedForecast(1000, 1200, 800, 0.9, 'strong')).toBe(1040)
  })
  it('high R² without strong seasonality → 60/40 trend/pipeline (seasonal weight 0)', () => {
    // 0.6×1000 + 0.4×500 = 800 (seasonal value ignored at weight 0)
    expect(computeBlendedForecast(1000, 9999, 500, 0.8, 'weak')).toBe(800)
  })
  it('redistributes weight to trend when seasonal and pipeline are absent', () => {
    // all weight collapses onto trend → returns the trend value
    expect(computeBlendedForecast(1000, null, null, 0.9, 'strong')).toBe(1000)
  })
  it('returns 0 when every method is unavailable', () => {
    expect(computeBlendedForecast(null, null, null, 0.9, 'strong')).toBe(0)
  })
  it('never returns a negative forecast', () => {
    expect(computeBlendedForecast(-5000, null, null, 0.9, 'strong')).toBe(0)
  })
})

describe('monthLabel', () => {
  it('formats YYYY-MM as a Turkish "Month Year" label', () => {
    expect(monthLabel('2026-06')).toBe('Haziran 2026')
    expect(monthLabel('2026-01')).toBe('Ocak 2026')
    expect(monthLabel('2025-12')).toBe('Aralık 2025')
  })
})
