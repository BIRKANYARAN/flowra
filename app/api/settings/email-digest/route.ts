// ── GET/POST /api/settings/email-digest ──────────────────────────────────────
//
// GET  → returns current email digest config for the company
//        (ADMIN_DIGEST_EMAIL env var + whether RESEND_API_KEY is configured)
//
// POST → sends a test digest email to the requesting admin's email address
//
// Admin only.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }           from '@/lib/api-auth'
import { requireAdmin }             from '@/lib/require-role'
import { EmailService, buildAlertDigestHtml } from '@/lib/services/email.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase: sb } = auth

  try { await requireAdmin(uid, companyId, sb) }
  catch { return NextResponse.json({ error: 'Admin yetkisi gerekli' }, { status: 403 }) }

  return NextResponse.json({
    configured:       !!process.env.RESEND_API_KEY,
    digest_recipient: process.env.ADMIN_DIGEST_EMAIL ?? null,
    from_address:     process.env.RESEND_FROM_EMAIL ?? 'Flowra <noreply@flowra.app>',
    daily_cron:       process.env.CRON_SECRET ? 'configured' : 'not_configured',
  })
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  try { await requireAdmin(uid, companyId, supabase) }
  catch { return NextResponse.json({ error: 'Admin yetkisi gerekli' }, { status: 403 }) }

  // ── Get recipient email ──────────────────────────────────────────────────────
  const body  = await req.json().catch(() => ({})) as { to?: string }
  let   toEmail: string | null = body.to ?? null

  // Fallback to the requesting user's email
  if (!toEmail) {
    const { data: userData } = await supabase.auth.getUser()
    toEmail = userData?.user?.email ?? null
  }

  if (!toEmail) {
    return NextResponse.json({ error: 'No recipient email available' }, { status: 400 })
  }

  // ── Get company name ──────────────────────────────────────────────────────────
  const { data: co } = await supabase.from('companies').select('name').eq('id', companyId).single()
  const companyName  = co?.name ?? 'Şirket'

  // ── Build test digest ─────────────────────────────────────────────────────────
  const today       = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const dashboardUrl= (process.env.NEXT_PUBLIC_APP_URL ?? 'https://flowra-blue.vercel.app') + '/dashboard'

  const html = buildAlertDigestHtml({
    companyName,
    date:        today,
    critical: [
      {
        title:    '🔴 Test — Kritik Uyarı Örneği',
        detail:   'Bu, e-posta bildirimlerinin doğru çalıştığını teyit eden bir test mesajıdır.',
        severity: 'critical',
        amount:   0,
      },
    ],
    warnings: [
      {
        title:    '⚠️ Test — Uyarı Örneği',
        detail:   'Gerçek uyarılar, eşik değerler aşıldığında otomatik olarak gönderilecektir.',
        severity: 'warning',
        amount:   0,
      },
    ],
    dashboardUrl,
  })

  const result = await EmailService.send({
    to:      toEmail,
    subject: `🧪 Flowra Test — E-posta Bildirimleri Aktif · ${today}`,
    html,
    tags: [{ name: 'type', value: 'test' }],
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok:        true,
    sent_to:   toEmail,
    message_id:result.messageId,
    note:      process.env.RESEND_API_KEY
      ? 'Email sent via Resend API'
      : 'RESEND_API_KEY not set — logged to console only (dev mode)',
  })
}
