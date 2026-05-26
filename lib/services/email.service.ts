// ── Email Service — Resend-based transactional email ─────────────────────────
//
// Sends emails via the Resend API (https://api.resend.com/emails).
// No SDK dependency — uses fetch directly.
//
// Safety:
//   • Requires RESEND_API_KEY env var. If absent, logs to console (dev mode).
//   • FROM address: RESEND_FROM_EMAIL env var (default: noreply@flowra.app)
//   • Rate limit: max 2 req/s per Resend free tier; job digest is sent once/day.
//   • All errors are caught and returned — never throws to callers.
//
// Usage:
//   const result = await EmailService.send({ to, subject, html })
//   if (!result.ok) console.warn(result.error)

export interface EmailPayload {
  to:       string | string[]
  subject:  string
  html:     string
  replyTo?: string
  tags?:    Array<{ name: string; value: string }>
}

export interface EmailResult {
  ok:        boolean
  messageId?: string
  error?:    string
}

const RESEND_API = 'https://api.resend.com/emails'

export class EmailService {
  static async send(payload: EmailPayload): Promise<EmailResult> {
    const apiKey  = process.env.RESEND_API_KEY
    const from    = process.env.RESEND_FROM_EMAIL ?? 'Flowra <noreply@flowra.app>'

    // ── Dev fallback — log to console when no API key ────────────────────────
    if (!apiKey) {
      console.log('[EmailService] No RESEND_API_KEY — would send:', {
        to:      payload.to,
        subject: payload.subject,
        preview: payload.html.replace(/<[^>]*>/g, '').slice(0, 120) + '…',
      })
      return { ok: true, messageId: 'dev-noop' }
    }

    try {
      const res = await fetch(RESEND_API, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to:      Array.isArray(payload.to) ? payload.to : [payload.to],
          subject: payload.subject,
          html:    payload.html,
          ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
          ...(payload.tags    ? { tags: payload.tags }         : {}),
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        return { ok: false, error: `Resend ${res.status}: ${body}` }
      }

      const data = await res.json() as { id?: string }
      return { ok: true, messageId: data.id }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' }
    }
  }
}

// ── Template helpers ──────────────────────────────────────────────────────────

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f8fafc; color: #0f172a; padding: 0; margin: 0;
`

/** Wrap HTML content in a branded Flowra email shell */
export function wrapEmailTemplate(
  title:   string,
  content: string,
  company?: string,
): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="${BASE_STYLE}">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <!-- Header -->
    <div style="background:#6d28d9; border-radius:8px 8px 0 0; padding:16px 24px; display:flex; align-items:center; gap:12px;">
      <span style="font-size:20px; font-weight:900; color:#fff; letter-spacing:-0.5px;">Flowra</span>
      ${company ? `<span style="font-size:12px; color:#ddd6fe; margin-left:auto;">${escapeHtml(company)}</span>` : ''}
    </div>

    <!-- Body -->
    <div style="background:#fff; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 8px 8px; padding:24px;">
      <h1 style="font-size:18px; font-weight:800; margin:0 0 16px; color:#0f172a;">${escapeHtml(title)}</h1>
      ${content}
    </div>

    <!-- Footer -->
    <p style="font-size:11px; color:#94a3b8; text-align:center; margin-top:16px;">
      Flowra Financial OS · Bu e-posta otomatik olarak gönderilmiştir.
      ${company ? `&nbsp;·&nbsp;${escapeHtml(company)}` : ''}
    </p>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Render a single alert row for the digest template */
export function renderAlertRow(alert: {
  title:    string
  detail:   string
  severity: string
  amount?:  number
}): string {
  const severityColors: Record<string, { bg: string; border: string; badge: string }> = {
    critical: { bg: '#fef2f2', border: '#fecaca', badge: '#ef4444' },
    warning:  { bg: '#fffbeb', border: '#fde68a', badge: '#f59e0b' },
    info:     { bg: '#f0f9ff', border: '#bae6fd', badge: '#0ea5e9' },
  }
  const c = severityColors[alert.severity] ?? severityColors.info

  const severityLabel = alert.severity === 'critical' ? 'Kritik'
    : alert.severity === 'warning' ? 'Uyarı' : 'Bilgi'

  const amountStr = alert.amount != null && alert.amount > 0
    ? `<span style="font-weight:700; float:right;">₺${Math.round(alert.amount).toLocaleString('tr-TR')}</span>`
    : ''

  return `
  <div style="border:1px solid ${c.border}; background:${c.bg}; border-radius:6px; padding:12px 16px; margin-bottom:8px;">
    <div style="display:flex; align-items:flex-start; gap:8px;">
      <span style="background:${c.badge}; color:#fff; font-size:10px; font-weight:700;
                   padding:2px 6px; border-radius:4px; white-space:nowrap; flex-shrink:0;">
        ${escapeHtml(severityLabel)}
      </span>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:14px; margin-bottom:2px;">
          ${escapeHtml(alert.title)}${amountStr}
        </div>
        <div style="font-size:12px; color:#475569;">${escapeHtml(alert.detail)}</div>
      </div>
    </div>
  </div>`
}

/** Build a Turkish daily digest email body */
export function buildAlertDigestHtml(params: {
  companyName: string
  date:        string    // "26 Mayıs 2026"
  critical:    Array<{ title: string; detail: string; severity: string; amount?: number }>
  warnings:    Array<{ title: string; detail: string; severity: string; amount?: number }>
  dashboardUrl:string
}): string {
  const { companyName, date, critical, warnings, dashboardUrl } = params

  const totalCount    = critical.length + warnings.length
  const criticalRows  = critical.map(a => renderAlertRow(a)).join('')
  const warningRows   = warnings.map(a => renderAlertRow(a)).join('')

  const summaryLine = critical.length > 0
    ? `<strong>${critical.length} kritik</strong> ve ${warnings.length} uyarı bildirimi mevcut.`
    : `<strong>${warnings.length}</strong> uyarı bildirimi mevcut.`

  const criticalSection = critical.length > 0 ? `
    <h2 style="font-size:13px; font-weight:800; text-transform:uppercase;
               letter-spacing:0.05em; color:#dc2626; margin:16px 0 8px;">
      🚨 Kritik Uyarılar (${critical.length})
    </h2>
    ${criticalRows}` : ''

  const warningSection = warnings.length > 0 ? `
    <h2 style="font-size:13px; font-weight:800; text-transform:uppercase;
               letter-spacing:0.05em; color:#d97706; margin:16px 0 8px;">
      ⚠️ Uyarılar (${warnings.length})
    </h2>
    ${warningRows}` : ''

  const content = `
    <p style="color:#64748b; font-size:13px; margin:0 0 16px;">
      ${escapeHtml(date)} tarihli günlük özet · ${escapeHtml(companyName)}
    </p>
    <p style="font-size:14px; margin:0 0 16px;">${summaryLine}</p>
    ${criticalSection}
    ${warningSection}
    <div style="margin-top:20px; padding-top:16px; border-top:1px solid #e2e8f0;">
      <a href="${escapeHtml(dashboardUrl)}"
         style="display:inline-block; background:#6d28d9; color:#fff;
                font-weight:700; font-size:13px; padding:10px 20px;
                border-radius:6px; text-decoration:none;">
        Kontrol Paneline Git →
      </a>
    </div>`

  return wrapEmailTemplate(
    `${totalCount} Bildirim — ${date}`,
    content,
    companyName,
  )
}
