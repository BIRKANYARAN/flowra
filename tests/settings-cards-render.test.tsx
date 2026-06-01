// @vitest-environment jsdom
// Characterization tests for the presentational cards extracted from the 1011-line
// settings/page.tsx (BelgeKimligiCard, DemoCard, FaizOraniCard). All are prop-only
// (no hooks/fetch), so these are direct golden render + interaction checks that
// guard the extraction.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BelgeKimligiCard } from '@/app/dashboard/settings/_settings/BelgeKimligiCard'
import { DemoCard } from '@/app/dashboard/settings/_settings/DemoCard'
import { FaizOraniCard } from '@/app/dashboard/settings/_settings/FaizOraniCard'

afterEach(() => cleanup())

const noop = () => {}

describe('settings extracted cards — characterization', () => {
  it('BelgeKimligiCard renders palettes/styles and fires setters + save', () => {
    const setBrandColor = vi.fn(), setDocumentStyle = vi.fn(), onSave = vi.fn()
    render(
      <BelgeKimligiCard
        brandColor="charcoal" setBrandColor={setBrandColor}
        documentStyle="corporate" setDocumentStyle={setDocumentStyle}
        defaultPreparerName="" setDefaultPreparerName={noop}
        defaultPreparerTitle="" setDefaultPreparerTitle={noop}
        saving={false} onSave={onSave}
      />,
    )
    expect(screen.getByText('Belge Kimliği')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Lacivert'))      // a palette swatch
    expect(setBrandColor).toHaveBeenCalledWith('navy')
    fireEvent.click(screen.getByText('Yönetici'))        // a document style
    expect(setDocumentStyle).toHaveBeenCalledWith('executive')
    fireEvent.click(screen.getByText('Kaydet'))
    expect(onSave).toHaveBeenCalled()
  })

  it('DemoCard shows the production-disabled notice when disabled', () => {
    render(<DemoCard disabled loading={false} msg={null} onSeed={noop} onReset={noop} />)
    expect(screen.getByText('Canlı ortamda kapalıdır.')).toBeInTheDocument()
    expect(screen.queryByText('Demo Veri Yükle')).not.toBeInTheDocument()
  })

  it('DemoCard exposes seed/reset actions when enabled', () => {
    const onSeed = vi.fn(), onReset = vi.fn()
    render(<DemoCard disabled={false} loading={false} msg={null} onSeed={onSeed} onReset={onReset} />)
    fireEvent.click(screen.getByText('Demo Veri Yükle')); expect(onSeed).toHaveBeenCalled()
    fireEvent.click(screen.getByText('Sıfırla'));         expect(onReset).toHaveBeenCalled()
  })

  it('FaizOraniCard renders history rows and switches currency (clearing the rate)', () => {
    const setCurrency = vi.fn(), setRate = vi.fn()
    render(
      <FaizOraniCard
        currency="TRY" setCurrency={setCurrency} rate="45.5" setRate={setRate}
        saving={false} onSave={noop}
        history={[{ rate_date: '2026-01-01', annual_rate: 45.5, source: 'manual' }]}
      />,
    )
    expect(screen.getByText('%45.50')).toBeInTheDocument()
    fireEvent.click(screen.getByText('USD'))
    expect(setCurrency).toHaveBeenCalledWith('USD')
    expect(setRate).toHaveBeenCalledWith('')   // currency switch clears the input
  })
})
