'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { PageHeader, ErrorBanner } from '@/components/ui'
import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { FlowraInput }  from '@/components/ui-kit/FlowraInput'
import type { CompanyBank, UserSettings } from '@/types'
import { resolveCompanyId } from '@/lib/resolve-company'

// DS-aligned style tokens (primary instead of indigo, consistent radius)
const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors'
const LAB = 'block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5'

type Msg = { text: string; kind: 'success' | 'error' | 'info' }

function flash(setter: (m: Msg | null) => void, text: string, kind: Msg['kind'] = 'success') {
  setter({ text, kind })
  if (kind !== 'error') setTimeout(() => setter(null), 4500)
}

export default function SettingsPage() {
  const supabase = useSupabase()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [msg,          setMsg]          = useState<Msg | null>(null)

  // signedPreview: short-lived URL shown in <img> — never stored in DB
  // logoPath:      stable storage path stored in DB — used to re-sign on load
  const [signedPreview, setSignedPreview] = useState('')
  const [logoPath,      setLogoPath]      = useState('')

  const [form, setForm] = useState({
    company_name: '', address: '', phone: '',
    website: '', tax_number: '', tax_office: '',
    mersis_no: '',
  })

  const [banks,      setBanks]      = useState<CompanyBank[]>([])
  const [bankForm,   setBankForm]   = useState({ bank_name: '', branch_name: '', iban: '', is_default: false })
  const [addBank,    setAddBank]    = useState(false)
  const [editBankId, setEditBankId] = useState<string | null>(null)
  const [bankSaving, setBankSaving] = useState(false)
  const [bankMsg,    setBankMsg]    = useState<Msg | null>(null)

  const [intRate,     setIntRate]     = useState('')
  const [intSource,   setIntSource]   = useState<'manual' | 'ecb' | 'fed' | 'tcmb'>('manual')
  const [intSaving,   setIntSaving]   = useState(false)
  const [intHistory,  setIntHistory]  = useState<{ rate_date: string; annual_rate: number; source?: string }[]>([])
  // Phase 6 — per-currency interest rate entry (TRY/USD/EUR)
  const [intCurrency, setIntCurrency] = useState<'TRY'|'USD'|'EUR'>('TRY')

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)

    const [sRes, bRes] = await Promise.all([
      supabase.from('user_settings').select('*').eq('company_id', companyId).is('deleted_at', null)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('company_banks').select('*').eq('company_id', companyId).is('deleted_at', null)
        .order('is_default', { ascending: false }),
    ])

    if (sRes.data) {
      const d = sRes.data as UserSettings
      setForm({
        company_name: d.company_name || '', address:    d.address    || '',
        phone:        d.phone        || '', website:    d.website    || '',
        tax_number:   d.tax_number   || '', tax_office: d.tax_office || '',
        mersis_no:    d.mersis_no    || '',
      })

      // DB stores the full public URL (new uploads) or a legacy storage path.
      // • New: logo_url starts with "http" — use directly, no API round-trip needed.
      // • Legacy: logo_url is a bare path — call GET /api/upload/logo to resolve it.
      if (d.logo_url) {
        setLogoPath(d.logo_url)
        if (d.logo_url.startsWith('http')) {
          setSignedPreview(d.logo_url)
        } else {
          try {
            const logoRes = await fetch('/api/upload/logo')
            if (logoRes.ok) {
              const logoData = await logoRes.json()
              const resolved = logoData.url ?? logoData.signed_url
              if (resolved) setSignedPreview(resolved)
            }
          } catch { /* non-critical — preview will just be empty */ }
        }
      }
    }

    setBanks((bRes.data || []) as CompanyBank[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Interest history — reloads whenever the selected currency changes ────────
  const loadIntHistory = useCallback(async (currency: 'TRY'|'USD'|'EUR' = intCurrency) => {
    const { data } = await supabase
      .from('policy_rates')
      .select('rate_date, annual_rate, source')
      .eq('currency', currency)
      .order('rate_date', { ascending: false })
      .limit(6)
    setIntHistory((data || []) as { rate_date: string; annual_rate: number; source?: string }[])
  }, [intCurrency, supabase])

  useEffect(() => { loadIntHistory() }, [loadIntHistory])

  // ── Logo upload via secure API (FormData → magic bytes validation) ──────────
  async function uploadLogo(file: File) {
    setUploading(true)
    setMsg(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res  = await fetch('/api/upload/logo', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        flash(setMsg, data.error || 'Yükleme hatası', 'error')
        setUploading(false)
        return
      }

      // data.url is the permanent public URL stored in DB.
      const publicUrl = data.url ?? data.signed_url ?? ''
      setSignedPreview(publicUrl + (publicUrl.includes('?') ? '&' : '?') + `t=${Date.now()}`)
      setLogoPath(publicUrl)
      flash(setMsg, 'Logo yüklendi ve kaydedildi ✓')
    } catch {
      flash(setMsg, 'Ağ hatası: logo yüklenemedi', 'error')
    } finally {
      setUploading(false)
    }
  }

  function removeLogo() {
    setSignedPreview('')
    setLogoPath('')
    flash(setMsg, 'Logo kaldırıldı — kaydetmek için "Kaydet" butonuna basın.', 'info')
  }

  // ── Save company settings ──────────────────────────────────────────────────
  async function saveSettings() {
    setSaving(true)
    setMsg(null)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, company_id: companyId, ...form, logo_url: logoPath || null },
        { onConflict: 'user_id' }
      )

    setSaving(false)
    flash(setMsg, error ? 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' : 'Kaydedildi ✓', error ? 'error' : 'success')
  }

  // ── Bank CRUD ──────────────────────────────────────────────────────────────
  function openNewBank() {
    setBankForm({ bank_name: '', branch_name: '', iban: '', is_default: false })
    setEditBankId(null)
    setBankMsg(null)
    setAddBank(true)
  }

  function openEditBank(b: CompanyBank) {
    setBankForm({ bank_name: b.bank_name, branch_name: b.branch_name || '', iban: b.iban, is_default: b.is_default })
    setEditBankId(b.id)
    setBankMsg(null)
    setAddBank(true)
  }

  function closeBankForm() {
    setAddBank(false)
    setEditBankId(null)
    setBankMsg(null)
    setBankForm({ bank_name: '', branch_name: '', iban: '', is_default: false })
  }

  async function saveBank() {
    if (!bankForm.bank_name.trim() || !bankForm.iban.trim()) {
      flash(setBankMsg, 'Banka adı ve IBAN zorunludur.', 'error')
      return
    }
    setBankSaving(true)
    setBankMsg(null)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)

    if (bankForm.is_default) {
      await supabase.from('company_banks')
        .update({ is_default: false } as Record<string, unknown>)
        .eq('company_id', companyId)
    }

    if (editBankId) {
      const { error } = await supabase.from('company_banks').update({
        bank_name:   bankForm.bank_name.trim(),
        branch_name: bankForm.branch_name.trim() || null,
        iban:        bankForm.iban.trim(),
        is_default:  bankForm.is_default,
      } as Record<string, unknown>).eq('id', editBankId).eq('company_id', companyId)
      if (error) { flash(setBankMsg, 'Banka bilgileri güncellenemedi. Lütfen tekrar deneyin.', 'error'); setBankSaving(false); return }
    } else {
      const { error } = await supabase.from('company_banks').insert({
        user_id:     user.id,
        company_id:  companyId,
        bank_name:   bankForm.bank_name.trim(),
        branch_name: bankForm.branch_name.trim() || null,
        iban:        bankForm.iban.trim(),
        is_default:  bankForm.is_default,
      } as Record<string, unknown>)
      if (error) { flash(setBankMsg, 'Banka hesabı eklenemedi. Lütfen tekrar deneyin.', 'error'); setBankSaving(false); return }
    }

    closeBankForm()
    setBankSaving(false)
    load()
  }

  async function deleteBank(id: string) {
    if (!confirm('Bu banka hesabını silmek istediğinize emin misiniz?')) return
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const companyId = await resolveCompanyId(authData.user.id, supabase)
    await supabase.from('company_banks')
      .update({ deleted_at: new Date().toISOString() } as Record<string, unknown>)
      .eq('id', id)
      .eq('company_id', companyId)
    load()
  }

  async function setDefaultBank(id: string) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)
    await supabase.from('company_banks').update({ is_default: false } as Record<string, unknown>).eq('company_id', companyId)
    await supabase.from('company_banks').update({ is_default: true } as Record<string, unknown>).eq('id', id).eq('company_id', companyId)
    load()
  }

  // ── Interest rate (saves to policy_rates table — Phase 6: per-currency) ──────
  async function saveInterestRate() {
    if (!intRate) return
    setIntSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) { setIntSaving(false); return }

    const rate_date   = new Date().toISOString().slice(0, 10)
    const annual_rate = parseFloat(intRate)

    if (!isFinite(annual_rate) || annual_rate < 0 || annual_rate > 1000) {
      flash(setMsg, 'Geçersiz faiz oranı (0-1000 arası olmalıdır)', 'error')
      setIntSaving(false)
      return
    }

    const res = await fetch('/api/interest-rates', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ currency: intCurrency, rate_date, annual_rate, source: intSource }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string }

    if (!res.ok) {
      flash(setMsg, json.error ?? 'Faiz oranı kaydedilemedi. Lütfen tekrar deneyin.', 'error')
    } else {
      flash(setMsg, `${intCurrency} faiz oranı kaydedildi ✓`)
    }
    setIntRate('')
    setIntSaving(false)
    loadIntHistory(intCurrency)
  }

  // ── Demo management ────────────────────────────────────────────────────────
  const [demoDisabled, setDemoDisabled] = useState(process.env.NODE_ENV === 'production')
  const [demoLoading,  setDemoLoading]  = useState<false | 'seed' | 'reset'>(false)
  const [demoMsg,      setDemoMsg]      = useState<Msg | null>(null)

  async function loadDemo() {
    setDemoLoading('seed')
    setDemoMsg(null)
    try {
      const res  = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()
      if (res.status === 403) {
        setDemoDisabled(true)
      } else if (!res.ok) {
        flash(setDemoMsg, data.error || 'Demo veri yüklenemedi.', 'error')
      } else if (data.seeded === false) {
        flash(setDemoMsg, 'Demo veri zaten yüklü. Önce sıfırlayın.', 'info')
      } else {
        flash(setDemoMsg, 'Demo veri başarıyla yüklendi ✓')
      }
    } catch {
      flash(setDemoMsg, 'Ağ hatası: demo veri yüklenemedi.', 'error')
    }
    setDemoLoading(false)
  }

  async function resetDemo() {
    if (!confirm('Bu işlem tüm demo verileri silecek (müşteriler, proformalar, banka hesapları). Emin misiniz?')) return
    setDemoLoading('reset')
    setDemoMsg(null)
    try {
      const res  = await fetch('/api/reset', { method: 'POST' })
      const data = await res.json()
      if (res.status === 403) {
        setDemoDisabled(true)
      } else if (!res.ok) {
        flash(setDemoMsg, data.error || 'Sıfırlama başarısız.', 'error')
      } else {
        flash(setDemoMsg, 'Demo veriler sıfırlandı ✓')
        load()
      }
    } catch {
      flash(setDemoMsg, 'Ağ hatası: sıfırlama başarısız.', 'error')
    }
    setDemoLoading(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Ayarlar" />

      {msg && <MsgBanner msg={msg} />}

      {/* ── 2-column grid: left = Logo + Firma, right = Bankalar + Faiz ── */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* ── LEFT: Logo + Firma Bilgileri ─────────────────────────── */}
        <div className="space-y-4">

          {/* Logo */}
          <FlowraCard>
            <p className="font-bold text-sm border-b border-gray-100 pb-2 mb-3">Firma Logosu</p>

            {/* Hidden file input */}
            <input
              id="logo-file-input"
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) uploadLogo(f)
                e.target.value = ''
              }}
            />

            <div className="flex items-center gap-4">
              {/* Preview box */}
              <label
                htmlFor="logo-file-input"
                className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden hover:border-primary-400 transition-colors flex-shrink-0 relative"
                style={{ cursor: uploading ? 'default' : 'pointer' }}
                title="Logo yüklemek için tıklayın"
              >
                {signedPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signedPreview}
                    alt="Firma logosu"
                    className="w-full h-full object-contain p-1 pointer-events-none"
                    onLoad={() => console.log('[LOGO_RENDER_OK]', signedPreview)}
                    onError={() => { console.warn('[LOGO_FAIL]', signedPreview); setSignedPreview('') }}
                  />
                ) : (
                  <div className="text-center pointer-events-none">
                    <div className="text-xl text-gray-300">↑</div>
                    <div className="text-[10px] text-gray-400">Logo</div>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl pointer-events-none">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </label>

              {/* Controls */}
              <div className="flex-1 space-y-1.5">
                <label
                  htmlFor="logo-file-input"
                  className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors select-none ${
                    uploading
                      ? 'opacity-50 cursor-default bg-gray-50 border-gray-200 text-gray-400'
                      : 'cursor-pointer bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  {uploading ? 'Yükleniyor...' : signedPreview ? 'Değiştir' : 'Logo Seç'}
                </label>
                <p className="text-[10px] text-gray-400">PNG, JPG, WebP, SVG — maks 2MB</p>
                {signedPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="text-[10px] text-red-400 hover:text-red-600 transition-colors block"
                  >
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </FlowraCard>

          {/* Company Info */}
          <FlowraCard>
            <p className="font-bold text-sm border-b border-gray-100 pb-2 mb-3">Firma Bilgileri</p>

            <div className="space-y-3">
              <FlowraInput
                label="Firma Adı"
                placeholder="Şirket Adı A.Ş."
                maxLength={200}
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              />

              <div className="grid grid-cols-2 gap-3">
                <FlowraInput
                  label="Vergi No"
                  placeholder="1234567890"
                  maxLength={20}
                  value={form.tax_number}
                  onChange={e => setForm(f => ({ ...f, tax_number: e.target.value }))}
                />
                <FlowraInput
                  label="Vergi Dairesi"
                  placeholder="Kadıköy V.D."
                  maxLength={100}
                  value={form.tax_office}
                  onChange={e => setForm(f => ({ ...f, tax_office: e.target.value }))}
                />
              </div>

              <FlowraInput
                label="MERSİS No"
                placeholder="0123456789012345"
                maxLength={16}
                value={form.mersis_no}
                onChange={e => setForm(f => ({ ...f, mersis_no: e.target.value }))}
              />

              <div>
                <label className={LAB}>Adres</label>
                <textarea
                  className={`${IL} resize-none`}
                  rows={2}
                  placeholder="Sokak, Mahalle, İlçe, İl"
                  maxLength={500}
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FlowraInput
                  label="Telefon"
                  placeholder="+90 212 000 00 00"
                  maxLength={30}
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
                <FlowraInput
                  label="Website"
                  placeholder="www.firma.com"
                  maxLength={100}
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                />
              </div>

              <FlowraButton
                variant="primary"
                onClick={saveSettings}
                disabled={saving || uploading}
                loading={saving}
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </FlowraButton>
            </div>
          </FlowraCard>
        </div>

        {/* ── RIGHT: Bankalar + Faiz Oranı ─────────────────────────── */}
        <div className="space-y-4">

          {/* Banks */}
          <FlowraCard>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
              <div>
                <p className="font-bold text-sm">Banka Hesapları</p>
                <p className="text-[10px] text-gray-400 mt-0.5">PDF&apos;de ve proforma sayfasında gösterilir</p>
              </div>
              {!addBank && (
                <FlowraButton variant="secondary" size="sm" onClick={openNewBank}>
                  + Ekle
                </FlowraButton>
              )}
            </div>

            {addBank && (
              <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {editBankId ? 'Hesabı Düzenle' : 'Yeni Banka Hesabı'}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <FlowraInput
                    label="Banka Adı *"
                    placeholder="Akbank"
                    value={bankForm.bank_name}
                    onChange={e => setBankForm(b => ({ ...b, bank_name: e.target.value }))}
                  />
                  <FlowraInput
                    label="Şube Adı"
                    placeholder="Merkez Şubesi"
                    value={bankForm.branch_name}
                    onChange={e => setBankForm(b => ({ ...b, branch_name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className={LAB}>IBAN *</label>
                  <input
                    className={`${IL} font-mono tracking-wide`}
                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                    value={bankForm.iban}
                    onChange={e => setBankForm(b => ({ ...b, iban: e.target.value }))}
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                  <input
                    type="checkbox"
                    checked={bankForm.is_default}
                    onChange={e => setBankForm(b => ({ ...b, is_default: e.target.checked }))}
                    className="accent-primary-600 w-3.5 h-3.5"
                  />
                  Varsayılan hesap olarak işaretle
                </label>

                {bankMsg && <ErrorBanner msg={bankMsg.text} />}

                <div className="flex gap-2">
                  <FlowraButton
                    variant="primary"
                    size="sm"
                    onClick={saveBank}
                    loading={bankSaving}
                    disabled={bankSaving}
                  >
                    {bankSaving ? 'Kaydediliyor...' : editBankId ? 'Güncelle' : 'Ekle'}
                  </FlowraButton>
                  <FlowraButton variant="secondary" size="sm" onClick={closeBankForm}>
                    İptal
                  </FlowraButton>
                </div>
              </div>
            )}

            {banks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                Henüz banka hesabı eklenmedi.
              </p>
            ) : (
              <div className="space-y-1.5">
                {banks.map(b => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${
                      b.is_default
                        ? 'border-primary-200 bg-primary-50'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold">
                          {b.bank_name}{b.branch_name ? ` — ${b.branch_name}` : ''}
                        </span>
                        {b.is_default && (
                          <span className="text-[9px] bg-primary-600 text-white px-1.5 py-0.5 rounded-full">
                            Varsayılan
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">{b.iban}</div>
                    </div>

                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      {!b.is_default && (
                        <button
                          onClick={() => setDefaultBank(b.id)}
                          title="Varsayılan yap"
                          className="text-xs text-gray-400 hover:text-primary-600 px-1.5 py-1 rounded-lg hover:bg-primary-50 transition-colors"
                        >
                          ☆
                        </button>
                      )}
                      <FlowraButton variant="ghost" size="sm" onClick={() => openEditBank(b)}>
                        Düzenle
                      </FlowraButton>
                      <FlowraButton variant="ghost" size="sm" onClick={() => deleteBank(b.id)}>
                        Sil
                      </FlowraButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FlowraCard>

          {/* Interest Rate */}
          <FlowraCard>
            <p className="font-bold text-sm border-b border-gray-100 pb-2 mb-3">Faiz Oranı</p>

            {/* Currency + Source in one row */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex gap-1">
                {(['TRY', 'USD', 'EUR'] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setIntCurrency(c); setIntRate('') }}
                    className={`text-xs border rounded-md px-2.5 py-1 font-semibold transition-colors select-none ${
                      intCurrency === c
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="h-4 border-l border-gray-200" />
              <div className="flex gap-1 flex-wrap">
                {([
                  { key: 'tcmb',   label: 'TCMB',   hint: 'Türkiye Merkez Bankası politika faizi' },
                  { key: 'fed',    label: 'FED',     hint: 'ABD Merkez Bankası (USD)' },
                  { key: 'ecb',    label: 'ECB',     hint: 'Avrupa Merkez Bankası (EUR)' },
                  { key: 'manual', label: 'Manuel',  hint: 'Kendi belirlediğiniz oran' },
                ] as { key: 'manual' | 'ecb' | 'fed' | 'tcmb'; label: string; hint: string }[]).map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setIntSource(s.key)}
                    title={s.hint}
                    className={`text-xs border rounded-md px-2 py-1 transition-colors select-none ${
                      intSource === s.key
                        ? 'border-primary-400 bg-primary-50 text-primary-700 font-semibold'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <FlowraInput
                  label={`Yıllık Faiz (%) — ${intCurrency}${intSource !== 'manual' ? ' · API yakında' : ''}`}
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  placeholder="45.50"
                  value={intRate}
                  onChange={e => setIntRate(e.target.value)}
                />
              </div>
              <FlowraButton
                variant="primary"
                onClick={saveInterestRate}
                loading={intSaving}
                disabled={intSaving || !intRate}
              >
                {intSaving ? '...' : 'Kaydet'}
              </FlowraButton>
            </div>

            {intHistory.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3 space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  Geçmiş — {intCurrency}
                </p>
                {intHistory.map(r => (
                  <div key={r.rate_date} className="flex justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">{r.rate_date}</span>
                      {r.source && r.source !== 'manual' && (
                        <span className="text-[9px] bg-gray-100 text-gray-400 px-1 rounded uppercase">
                          {r.source}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold tabular-nums">%{(Number(r.annual_rate) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </FlowraCard>
        </div>
      </div>

      {/* ── Demo Yönetimi — full width ─────────────────────────────── */}
      <FlowraCard>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Demo Yönetimi</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Örnek veri yükle veya sıfırla — müşteriler, proformalar, banka hesapları
            </p>
          </div>

          {demoDisabled ? (
            <div className="text-xs px-3 py-2 rounded-lg border bg-amber-50 border-amber-100 text-amber-700">
              Canlı ortamda kapalıdır.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {demoMsg && <MsgBanner msg={demoMsg} />}
              <FlowraButton
                variant="secondary"
                size="sm"
                onClick={loadDemo}
                loading={demoLoading === 'seed'}
                disabled={demoLoading !== false}
                className="border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
              >
                {demoLoading === 'seed' ? 'Yükleniyor...' : 'Demo Veri Yükle'}
              </FlowraButton>

              <FlowraButton
                variant="danger"
                size="sm"
                onClick={resetDemo}
                loading={demoLoading === 'reset'}
                disabled={demoLoading !== false}
              >
                {demoLoading === 'reset' ? 'Sıfırlanıyor...' : 'Sıfırla'}
              </FlowraButton>
            </div>
          )}
        </div>
      </FlowraCard>

    </div>
  )
}

// ── Shared inline helper ──────────────────────────────────────────────────────
function MsgBanner({ msg }: { msg: { text: string; kind: 'success' | 'error' | 'info' } }) {
  const styles = {
    success: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    error:   'bg-red-50 border-red-100 text-red-700',
    info:    'bg-amber-50 border-amber-100 text-amber-700',
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ' }
  return (
    <div className={`text-sm px-3 py-2.5 rounded-xl border flex items-center gap-2 ${styles[msg.kind]}`}>
      <span>{icons[msg.kind]}</span>
      {msg.text}
    </div>
  )
}
