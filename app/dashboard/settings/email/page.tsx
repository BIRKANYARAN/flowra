'use client'

// ── /dashboard/settings/email — E-posta Bildirimleri ─────────────────────────
// Admin-only page to configure email digest settings and send a test email.

import { useState, useEffect } from 'react'
import Link                    from 'next/link'
import { Skeleton }            from '@/components/ds'

interface DigestConfig {
  configured:       boolean
  digest_recipient: string | null
  from_address:     string
  daily_cron:       string
}

export default function EmailSettingsPage() {
  const [config,   setConfig]   = useState<DigestConfig | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [result,   setResult]   = useState<{ ok: boolean; message: string } | null>(null)
  const [testEmail,setTestEmail]= useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/settings/email-digest', { signal: controller.signal })
      .then(r => r.json())
      .then((d: DigestConfig) => setConfig(d))
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  async function sendTest() {
    setSending(true)
    setResult(null)
    try {
      const res  = await fetch('/api/settings/email-digest', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ to: testEmail || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, message: `Test e-postası gönderildi → ${data.sent_to}` })
      } else {
        setResult({ ok: false, message: data.error ?? 'Gönderim başarısız' })
      }
    } catch {
      setResult({ ok: false, message: 'Bağlantı hatası' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">E-posta Bildirimleri</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Günlük uyarı özeti · Resend API entegrasyonu</p>
        </div>
        <Link href="/dashboard/settings" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
          ← Ayarlar
        </Link>
      </div>

      {/* Status card */}
      {loading ? (
        <div className="bg-white rounded-xl border border-[#e8eaef] p-5 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : config ? (
        <div className="bg-white rounded-xl border border-[#e8eaef] p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#64748b]">Durum</h2>

          <div className="grid grid-cols-1 gap-3">
            <StatusRow
              label="Resend API"
              value={config.configured ? 'Bağlı' : 'Yapılandırılmadı'}
              ok={config.configured}
              hint={config.configured
                ? 'RESEND_API_KEY ortam değişkeni mevcut'
                : 'RESEND_API_KEY ortam değişkeni tanımlı değil — e-postalar konsola yazdırılacak'}
            />
            <StatusRow
              label="Günlük Cron"
              value={config.daily_cron === 'configured' ? 'Aktif' : 'Pasif'}
              ok={config.daily_cron === 'configured'}
              hint={config.daily_cron === 'configured'
                ? 'CRON_SECRET mevcut — Vercel cron çalışıyor'
                : 'CRON_SECRET tanımlı değil'}
            />
            <StatusRow
              label="Alıcı (ADMIN_DIGEST_EMAIL)"
              value={config.digest_recipient ?? 'Tanımlı değil'}
              ok={!!config.digest_recipient}
              hint={config.digest_recipient
                ? `Günlük özetler → ${config.digest_recipient}`
                : 'ADMIN_DIGEST_EMAIL ortam değişkeni ayarlanmamış — Vercel Environment Variables\'dan ekleyin'}
            />
            <StatusRow
              label="Gönderen Adres"
              value={config.from_address}
              ok={true}
              hint="RESEND_FROM_EMAIL ile özelleştirilebilir"
            />
          </div>
        </div>
      ) : null}

      {/* Test email */}
      <div className="bg-white rounded-xl border border-[#e8eaef] p-5 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#64748b]">Test E-postası</h2>
        <p className="text-sm text-[#64748b]">
          Gerçekçi bir uyarı özeti gönderek bildirim sisteminin çalıştığını doğrulayın.
        </p>

        <div className="flex gap-2">
          <input
            type="email"
            placeholder="E-posta adresi (boş bırakırsanız hesabınıza gönderilir)"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            className="flex-1 text-sm border border-[#e8eaef] rounded px-3 py-2
                       focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-[#94a3b8]"
          />
          <button
            onClick={sendTest}
            disabled={sending}
            className="text-sm font-semibold px-4 py-2 bg-brand text-white rounded
                       hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {sending ? 'Gönderiliyor…' : 'Test Gönder'}
          </button>
        </div>

        {result && (
          <div className={`text-sm px-3 py-2.5 rounded border flex items-center gap-2
            ${result.ok
              ? 'bg-pos-light border-pos-light text-pos-text'
              : 'bg-neg-light border-neg-light text-neg-text'
            }`}>
            <span>{result.ok ? '✓' : '✕'}</span>
            {result.message}
          </div>
        )}
      </div>

      {/* Setup guide */}
      <div className="bg-[#f8fafc] rounded-xl border border-[#e8eaef] p-5 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#64748b]">Kurulum Kılavuzu</h2>
        <div className="space-y-2 text-sm text-[#475569]">
          <Step num={1} text="resend.com adresinden ücretsiz bir Resend hesabı oluşturun" />
          <Step num={2} text="Resend Dashboard → API Keys bölümünden bir anahtar oluşturun" />
          <Step num={3} text="Vercel projenize RESEND_API_KEY ortam değişkeni olarak ekleyin" />
          <Step num={4} text="ADMIN_DIGEST_EMAIL değişkenini bildirim alacak e-posta adresiyle ayarlayın" />
          <Step num={5} text="İsteğe bağlı: RESEND_FROM_EMAIL ile gönderen adresini özelleştirin" />
          <Step num={6} text="Yukarıdaki test butonuyla doğrulayın" />
        </div>
        <p className="text-xs text-[#94a3b8]">
          Günlük özetler otomatik olarak 01:30 UTC&apos;de gönderilir (yalnızca kritik/uyarı bildirimi varsa).
        </p>
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusRow({ label, value, ok, hint }: {
  label: string; value: string; ok: boolean; hint: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-[#f1f5f9] last:border-0">
      <div className="flex-1">
        <div className="text-xs font-semibold text-[#64748b]">{label}</div>
        <div className="text-xs text-[#94a3b8] mt-0.5">{hint}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-pos' : 'bg-neg'}`} />
        <span className={`text-sm font-semibold ${ok ? 'text-pos-text' : 'text-neg-text'}`}>
          {value}
        </span>
      </div>
    </div>
  )
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-5 h-5 rounded-full bg-brand-subtle text-brand text-xs font-black
                       flex items-center justify-center flex-shrink-0 mt-0.5">
        {num}
      </span>
      <span>{text}</span>
    </div>
  )
}
