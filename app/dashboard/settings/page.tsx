'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { PageHeader, ErrorBanner } from '@/components/ui'
import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { FlowraInput }  from '@/components/ui-kit/FlowraInput'
import type { CompanyBank } from '@/types'
import { resolveCompanyId } from '@/lib/resolve-company'
import { IL, LAB, type Msg, flash } from './_settings/constants'
import { MsgBanner } from './_settings/MsgBanner'
import { BelgeKimligiCard } from './_settings/BelgeKimligiCard'
import { DemoCard } from './_settings/DemoCard'
import { SettingsQuickLinks } from './_settings/SettingsQuickLinks'
import { FaizOraniCard } from './_settings/FaizOraniCard'

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

  // ── Belge Kimliği (brand identity) ──────────────────────────────────────────
  const [brandColor,           setBrandColor]           = useState('charcoal')
  const [documentStyle,        setDocumentStyle]        = useState('corporate')
  const [defaultPreparerName,  setDefaultPreparerName]  = useState('')
  const [defaultPreparerTitle, setDefaultPreparerTitle] = useState('')

  const [banks,      setBanks]      = useState<CompanyBank[]>([])
  const [bankForm,   setBankForm]   = useState({ bank_name: '', branch_name: '', iban: '', is_default: false })
  const [addBank,    setAddBank]    = useState(false)
  const [editBankId, setEditBankId] = useState<string | null>(null)
  const [bankSaving, setBankSaving] = useState(false)
  const [bankMsg,    setBankMsg]    = useState<Msg | null>(null)

  const [intRate,     setIntRate]     = useState('')
  const [intSaving,   setIntSaving]   = useState(false)
  const [intHistory,  setIntHistory]  = useState<{ rate_date: string; annual_rate: number; source?: string }[]>([])
  const [intCurrency, setIntCurrency] = useState<'TRY'|'USD'|'EUR'>('TRY')

  // ── Load ────────────────────────────────────────────────────────────────────
  // Company info lives on the `companies` table (name, address, phone, website,
  // logo_url, tax_id, tax_office, mersis_no). The old code read from user_settings
  // which has NONE of these columns — every load silently returned nothing.
  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) { setLoading(false); return }
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)

    // Base company fields + banks — these always exist
    const [coRes, bRes] = await Promise.all([
      supabase
        .from('companies')
        .select('name, address, phone, website, tax_id, tax_office, mersis_no, logo_url, email')
        .eq('id', companyId)
        .maybeSingle(),
      supabase
        .from('company_banks')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('is_default', { ascending: false }),
    ])

    if (coRes.data) {
      const d = coRes.data as Record<string, string | null>
      setForm({
        company_name: d.name       || '',
        address:      d.address    || '',
        phone:        d.phone      || '',
        website:      d.website    || '',
        tax_number:   d.tax_id     || '',   // companies.tax_id ↔ form.tax_number
        tax_office:   d.tax_office || '',
        mersis_no:    d.mersis_no  || '',
      })

      // Brand identity columns — added via migration; load separately so a missing
      // column in the schema cache cannot poison the base company load above.
      try {
        const brandRes = await supabase
          .from('companies')
          .select('brand_color, document_style, default_preparer_name, default_preparer_title')
          .eq('id', companyId)
          .maybeSingle()
        if (brandRes.data && !brandRes.error) {
          const b = brandRes.data as Record<string, string | null>
          setBrandColor(b.brand_color   || 'charcoal')
          setDocumentStyle(b.document_style || 'corporate')
          setDefaultPreparerName(b.default_preparer_name   || '')
          setDefaultPreparerTitle(b.default_preparer_title || '')
        }
      } catch { /* brand columns not yet migrated — use UI defaults */ }

      const logoUrl = d.logo_url
      if (logoUrl) {
        setLogoPath(logoUrl)
        // New uploads: full https:// URL — use directly
        // Legacy: bare storage path — resolve via API
        if (logoUrl.startsWith('http')) {
          setSignedPreview(logoUrl)
        } else {
          try {
            const logoRes = await fetch('/api/upload/logo')
            if (logoRes.ok) {
              const logoData = (await logoRes.json()) as Record<string, string>
              const resolved = logoData.url ?? logoData.signed_url
              if (resolved) setSignedPreview(resolved)
            }
          } catch { /* non-critical — preview stays empty */ }
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
  // Saves to `companies` table (company_name→name, tax_number→tax_id).
  // logo_url is managed separately by /api/upload/logo (already saved to companies).
  async function saveSettings() {
    setSaving(true)
    setMsg(null)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) {
        flash(setMsg, 'Oturum bilgileri alınamadı. Lütfen sayfayı yenileyip tekrar deneyin.', 'error')
        setSaving(false)
        return
      }
      const user = authData.user
      const companyId = await resolveCompanyId(user.id, supabase)

      // ── Base company fields (always present columns) ─────────────────────
      const { error } = await supabase
        .from('companies')
        .update({
          name:       form.company_name.trim() || undefined,
          address:    form.address.trim()    || null,
          phone:      form.phone.trim()      || null,
          website:    form.website.trim()    || null,
          tax_id:     form.tax_number.trim() || null,
          tax_office: form.tax_office.trim() || null,
          mersis_no:  form.mersis_no.trim()  || null,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq('id', companyId)

      if (error) {
        flash(setMsg, `Kayıt hatası: ${error.message}`, 'error')
        return
      }

      // ── Brand identity columns (added via migration — save separately) ────
      // If these columns don't exist yet the error is silenced; user sees a
      // note to run the migration rather than a blocking error.
      const { error: brandErr } = await supabase
        .from('companies')
        .update({
          brand_color:            brandColor,
          document_style:         documentStyle,
          default_preparer_name:  defaultPreparerName.trim()  || null,
          default_preparer_title: defaultPreparerTitle.trim() || null,
        } as Record<string, unknown>)
        .eq('id', companyId)

      if (brandErr) {
        // Columns missing — surface friendly hint instead of raw error
        flash(setMsg, 'Firma bilgileri kaydedildi ✓ — Belge kimliği için SQL migrasyonu gerekli (bkz. patch_company_settings_columns.sql)', 'info')
      } else {
        flash(setMsg, 'Firma bilgileri kaydedildi ✓')
      }
      load()   // re-fetch to confirm DB round-trip
    } catch (e) {
      flash(setMsg, 'Beklenmeyen hata: ' + String(e), 'error')
    } finally {
      setSaving(false)
    }
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
      body:    JSON.stringify({ currency: intCurrency, rate_date, annual_rate, source: 'manual' }),
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
      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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
            <p className="font-bold text-sm border-b border-[#e8eaef] pb-2 mb-3">Firma Logosu</p>

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
                className="w-16 h-16 rounded border-2 border-dashed border-[#e8eaef] flex items-center justify-center bg-[#f8fafc] overflow-hidden hover:border-brand/30 transition-colors flex-shrink-0 relative"
                style={{ cursor: uploading ? 'default' : 'pointer' }}
                title="Logo yüklemek için tıklayın"
              >
                {signedPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signedPreview}
                    alt="Firma logosu"
                    className="w-full h-full object-contain p-1 pointer-events-none"
                    onError={() => { setSignedPreview('') }}
                  />
                ) : (
                  <div className="text-center pointer-events-none">
                    <div className="text-xl text-[#cbd5e1]">↑</div>
                    <div className="text-[10px] text-[#94a3b8]">Logo</div>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded pointer-events-none">
                    <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </label>

              {/* Controls */}
              <div className="flex-1 space-y-1.5">
                <label
                  htmlFor="logo-file-input"
                  className={`inline-flex items-center justify-center px-3 py-1.5 rounded border text-xs font-semibold transition-colors select-none ${
                    uploading
                      ? 'opacity-50 cursor-default bg-[#f8fafc] border-[#e8eaef] text-[#94a3b8]'
                      : 'cursor-pointer bg-white border-[#e8eaef] text-[#334155] hover:bg-[#f8fafc] hover:border-[#e8eaef]'
                  }`}
                >
                  {uploading ? 'Yükleniyor...' : signedPreview ? 'Değiştir' : 'Logo Seç'}
                </label>
                <p className="text-[10px] text-[#94a3b8]">PNG, JPG, WebP, SVG — maks 2MB</p>
                {signedPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="text-[10px] text-neg hover:text-neg transition-colors block"
                  >
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </FlowraCard>

          {/* Company Info */}
          <FlowraCard>
            <p className="font-bold text-sm border-b border-[#e8eaef] pb-2 mb-3">Firma Bilgileri</p>

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
            <div className="flex items-center justify-between border-b border-[#e8eaef] pb-2 mb-3">
              <div>
                <p className="font-bold text-sm">Banka Hesapları</p>
                <p className="text-[10px] text-[#94a3b8] mt-0.5">PDF&apos;de ve proforma sayfasında gösterilir</p>
              </div>
              {!addBank && (
                <FlowraButton variant="secondary" size="sm" onClick={openNewBank}>
                  + Ekle
                </FlowraButton>
              )}
            </div>

            {addBank && (
              <div className="bg-[#f8fafc] rounded p-3 mb-3 space-y-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
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
                    className="accent-brand-light w-3.5 h-3.5"
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
              <p className="text-xs text-[#94a3b8] text-center py-4">
                Henüz banka hesabı eklenmedi.
              </p>
            ) : (
              <div className="space-y-1.5">
                {banks.map(b => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded px-3 py-2 border transition-colors ${
                      b.is_default
                        ? 'border-[#e8eaef] bg-brand-subtle'
                        : 'border-[#e8eaef] hover:bg-[#f8fafc]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold">
                          {b.bank_name}{b.branch_name ? ` — ${b.branch_name}` : ''}
                        </span>
                        {b.is_default && (
                          <span className="text-[9px] bg-brand-light text-white px-1.5 py-0.5 rounded">
                            Varsayılan
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-[#64748b] mt-0.5 truncate">{b.iban}</div>
                    </div>

                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      {!b.is_default && (
                        <button
                          onClick={() => setDefaultBank(b.id)}
                          title="Varsayılan yap"
                          className="text-xs text-[#94a3b8] hover:text-brand-light px-1.5 py-1 rounded hover:bg-brand-subtle transition-colors"
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
          <FaizOraniCard
            currency={intCurrency}
            setCurrency={setIntCurrency}
            rate={intRate}
            setRate={setIntRate}
            saving={intSaving}
            onSave={saveInterestRate}
            history={intHistory}
          />
        </div>
      </div>

      {/* ── Belge Kimliği / Kurumsal Kimlik ─────────────────────────── */}
      <BelgeKimligiCard
        brandColor={brandColor}                     setBrandColor={setBrandColor}
        documentStyle={documentStyle}               setDocumentStyle={setDocumentStyle}
        defaultPreparerName={defaultPreparerName}   setDefaultPreparerName={setDefaultPreparerName}
        defaultPreparerTitle={defaultPreparerTitle} setDefaultPreparerTitle={setDefaultPreparerTitle}
        saving={saving}                             onSave={saveSettings}
      />

      {/* ── Demo Yönetimi — full width ─────────────────────────────── */}
      <DemoCard
        disabled={demoDisabled}
        loading={demoLoading}
        msg={demoMsg}
        onSeed={loadDemo}
        onReset={resetDemo}
      />

      {/* ── Quick Links ─────────────────────────────────────────────────── */}
      <SettingsQuickLinks />

    </div>
  )
}
