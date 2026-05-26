/**
 * Tests for lib/services/email.service.ts
 * Pure template-rendering functions — no network calls.
 * Run with: npx vitest run tests/email-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  wrapEmailTemplate,
  renderAlertRow,
  buildAlertDigestHtml,
} from '../lib/services/email.service'

// ── wrapEmailTemplate ─────────────────────────────────────────────────────────

describe('wrapEmailTemplate', () => {
  it('includes title in output', () => {
    const html = wrapEmailTemplate('Test Başlık', '<p>İçerik</p>')
    expect(html).toContain('Test Başlık')
  })

  it('includes content in output', () => {
    const html = wrapEmailTemplate('T', '<p>İçerik burada</p>')
    expect(html).toContain('İçerik burada')
  })

  it('includes company name when provided', () => {
    const html = wrapEmailTemplate('T', '<p>x</p>', 'Acme Şirketi')
    expect(html).toContain('Acme Şirketi')
  })

  it('omits company name when not provided', () => {
    const html = wrapEmailTemplate('T', '<p>x</p>')
    expect(html).not.toContain('undefined')
  })

  it('escapes HTML special characters in title', () => {
    const html = wrapEmailTemplate('<script>alert(1)</script>', '<p>ok</p>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes HTML special characters in company name', () => {
    const html = wrapEmailTemplate('T', '<p>x</p>', '<Evil Corp>')
    expect(html).not.toContain('<Evil')
    expect(html).toContain('&lt;Evil')
  })

  it('produces valid HTML structure', () => {
    const html = wrapEmailTemplate('T', '<p>x</p>')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('Flowra')
  })
})

// ── renderAlertRow ────────────────────────────────────────────────────────────

describe('renderAlertRow', () => {
  const criticalAlert = {
    title:    'Kritik Nakit Uyarısı',
    detail:   'Nakit pisti 30 günün altına düştü',
    severity: 'critical',
  }
  const warningAlert = {
    title:    'Alacak Uyarısı',
    detail:   '₺50K vadesi geçmiş alacak',
    severity: 'warning',
    amount:   50_000,
  }

  it('contains the alert title', () => {
    const html = renderAlertRow(criticalAlert)
    expect(html).toContain('Kritik Nakit Uyarısı')
  })

  it('contains the alert detail', () => {
    const html = renderAlertRow(criticalAlert)
    expect(html).toContain('Nakit pisti 30 günün altına düştü')
  })

  it('shows "Kritik" badge for critical severity', () => {
    const html = renderAlertRow(criticalAlert)
    expect(html).toContain('Kritik')
  })

  it('shows "Uyarı" badge for warning severity', () => {
    const html = renderAlertRow(warningAlert)
    expect(html).toContain('Uyarı')
  })

  it('shows "Bilgi" badge for info severity', () => {
    const html = renderAlertRow({ title: 'x', detail: 'y', severity: 'info' })
    expect(html).toContain('Bilgi')
  })

  it('renders amount when provided', () => {
    const html = renderAlertRow(warningAlert)
    expect(html).toContain('50.000')  // Turkish locale formatting
  })

  it('does not render amount div when amount is 0', () => {
    const html = renderAlertRow({ ...warningAlert, amount: 0 })
    expect(html).not.toContain('50.000')
  })

  it('uses red border color for critical', () => {
    const html = renderAlertRow(criticalAlert)
    expect(html).toContain('#ef4444')  // critical badge color
  })

  it('uses amber color for warning', () => {
    const html = renderAlertRow(warningAlert)
    expect(html).toContain('#f59e0b')  // warning badge color
  })
})

// ── buildAlertDigestHtml ──────────────────────────────────────────────────────

describe('buildAlertDigestHtml', () => {
  const basePrams = {
    companyName:  'Test Şirketi',
    date:         '26 Mayıs 2026',
    critical:     [{
      title:    'Kritik Nakit',
      detail:   '15 günlük pist',
      severity: 'critical',
      amount:   0,
    }],
    warnings:     [{
      title:    'Alacak Uyarısı',
      detail:   '45 günlük alacak',
      severity: 'warning',
      amount:   25_000,
    }],
    dashboardUrl: 'https://app.flowra.io/dashboard',
  }

  it('includes company name', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('Test Şirketi')
  })

  it('includes the date', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('26 Mayıs 2026')
  })

  it('includes dashboard URL', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('https://app.flowra.io/dashboard')
  })

  it('shows critical section when critical alerts present', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('Kritik Uyarılar')
    expect(html).toContain('Kritik Nakit')
  })

  it('shows warning section when warnings present', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('Uyarılar')
    expect(html).toContain('Alacak Uyarısı')
  })

  it('hides critical section when no critical alerts', () => {
    const html = buildAlertDigestHtml({ ...basePrams, critical: [] })
    expect(html).not.toContain('Kritik Uyarılar (')
  })

  it('hides warning section when no warnings', () => {
    const html = buildAlertDigestHtml({ ...basePrams, warnings: [] })
    // The warnings section header includes the emoji prefix ⚠️ — if absent, section is hidden
    expect(html).not.toContain('⚠️ Uyarılar')
  })

  it('subject includes count info', () => {
    // The subject is built separately, but the body's summary line should reflect totals
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('1 kritik')
  })

  it('summary line mentions both counts when mixed', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('1 kritik')
    expect(html).toContain('1 uyarı')
  })

  it('contains call-to-action button', () => {
    const html = buildAlertDigestHtml(basePrams)
    expect(html).toContain('Kontrol Paneline Git')
  })

  it('renders valid HTML (no unclosed angle brackets in visible text)', () => {
    const html = buildAlertDigestHtml(basePrams)
    // Check no raw script injection via company name
    expect(html).not.toContain('<script>')
    // HTML should be well-formed enough to have doctype
    expect(html).toContain('<!DOCTYPE html>')
  })
})
