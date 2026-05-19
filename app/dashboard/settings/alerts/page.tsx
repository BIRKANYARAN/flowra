'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface AlertRule {
  id:              string | null
  rule_type:       string
  threshold_value: number | null
  severity:        'info' | 'warning' | 'critical'
  is_active:       boolean
}

const RULE_META: Record<string, { label: string; desc: string; unit: string; icon: string }> = {
  RECEIVABLE_30:     { label: '30+ Gün Vade Uyarısı',   desc: 'Minimum tutar (TRY)',              unit: '₺',  icon: '📬' },
  RECEIVABLE_60:     { label: '60+ Gün Kritik Alacak',  desc: 'Minimum tutar (TRY)',              unit: '₺',  icon: '🚨' },
  CASH_RUNWAY_90:    { label: 'Nakit Pist Uyarısı',     desc: 'Gün eşiği',                       unit: 'gün',icon: '💰' },
  CASH_RUNWAY_30:    { label: 'Kritik Nakit Pisti',     desc: 'Gün eşiği',                       unit: 'gün',icon: '🔴' },
  PARTNER_BURDEN:    { label: 'Ortak Yük Dengesizliği', desc: 'Oran eşiği (0.0 – 1.0)',          unit: '',   icon: '⚖️' },
  PARTNER_LOAN_DUE:  { label: 'Ortak Borç Vadesi',      desc: 'Kaç gün önce uyarı',              unit: 'gün',icon: '📅' },
  PERIOD_NOT_CLOSED: { label: 'Açık Dönem Uyarısı',    desc: 'Dönem bittikten kaç gün sonra',   unit: 'gün',icon: '📆' },
  TAX_DUE_SOON:      { label: 'Yaklaşan Vergi Beyanı',  desc: 'Kaç gün önce uyarı',              unit: 'gün',icon: '🧾' },
  BS_IMBALANCED:     { label: 'Bilanço Dengesizliği',   desc: 'Tolerans (TRY)',                  unit: '₺',  icon: '⚠️' },
  LEGAL_RESERVE_LOW: { label: 'Yasal Yedek Yetersiz',   desc: 'TTK 519 — 0 = her eksiklikte',   unit: '₺',  icon: '📋' },
  DSR_HIGH:          { label: 'Yüksek Borç Servisi',    desc: 'Borç/Gelir oranı eşiği (0–1)',   unit: '',   icon: '📊' },
  CONCENTRATION:     { label: 'Borç Konsantrasyonu',    desc: 'Tek ortak payı eşiği (0–1)',      unit: '',   icon: '🎯' },
}

const SEVERITY_OPTS: Array<{ value: string; label: string; cls: string }> = [
  { value: 'info',     label: 'Bilgi',    cls: 'bg-blue-100 text-blue-700'   },
  { value: 'warning',  label: 'Uyarı',   cls: 'bg-amber-100 text-amber-700' },
  { value: 'critical', label: 'Kritik',  cls: 'bg-red-100 text-red-700'     },
]

function severityCls(s: string) {
  return SEVERITY_OPTS.find(o => o.value === s)?.cls ?? 'bg-gray-100 text-gray-600'
}

export default function AlertSettingsPage() {
  const [rules,   setRules]   = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [flash,   setFlash]   = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/settings/alerts', { signal: controller.signal })
      .then(r => r.json())
      .then(d => setRules(d.rules ?? []))
      .catch(e => { if (e.name !== 'AbortError') setError('Kurallar yüklenemedi') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  async function saveRule(rule: AlertRule) {
    setSaving(rule.rule_type)
    try {
      const res = await fetch('/api/settings/alerts', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type:       rule.rule_type,
          threshold_value: rule.threshold_value,
          severity:        rule.severity,
          is_active:       rule.is_active,
        }),
      })
      if (!res.ok) throw new Error('Kayıt başarısız')
      setFlash(`${RULE_META[rule.rule_type]?.label ?? rule.rule_type} güncellendi`)
      setTimeout(() => setFlash(null), 3000)
    } catch {
      setError('Kayıt sırasında hata oluştu')
    } finally {
      setSaving(null)
    }
  }

  function updateRule(ruleType: string, patch: Partial<AlertRule>) {
    setRules(prev => prev.map(r => r.rule_type === ruleType ? { ...r, ...patch } : r))
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Uyarı Kuralları</h1>
          <p className="text-xs text-gray-400 mt-0.5">Her kural için eşik değerini ve ciddiyetini yapılandırın</p>
        </div>
        <Link href="/dashboard/settings" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← Ayarlar</Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {flash && (
        <div className="bg-emerald-50 border border-emerald-200 rounded px-4 py-3 text-sm text-emerald-700">{flash}</div>
      )}

      {loading && <div className="bg-gray-100 rounded h-64 animate-pulse" />}

      {!loading && (
        <div className="bg-white border border-gray-100 rounded overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <span>Kural</span>
              <span>Eşik</span>
              <span>Ciddiyet</span>
              <span>Aktif</span>
              <span></span>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {rules.map(rule => {
              const meta = RULE_META[rule.rule_type] ?? { label: rule.rule_type, desc: '', unit: '', icon: '🔔' }
              return (
                <div key={rule.rule_type} className="px-4 py-3 grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-center">
                  {/* Rule info */}
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">{meta.icon}</span>
                    <div>
                      <div className="text-xs font-semibold text-gray-900">{meta.label}</div>
                      <div className="text-[10px] text-gray-400">{meta.desc}</div>
                    </div>
                  </div>

                  {/* Threshold */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={rule.threshold_value ?? ''}
                      onChange={e => updateRule(rule.rule_type, { threshold_value: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-right"
                    />
                    {meta.unit && <span className="text-[10px] text-gray-400 shrink-0">{meta.unit}</span>}
                  </div>

                  {/* Severity */}
                  <select
                    value={rule.severity}
                    onChange={e => updateRule(rule.rule_type, { severity: e.target.value as AlertRule['severity'] })}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    {SEVERITY_OPTS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  {/* Active toggle */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => updateRule(rule.rule_type, { is_active: !rule.is_active })}
                      className={`w-8 h-4 rounded-full transition-colors relative ${rule.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${rule.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Save */}
                  <button
                    onClick={() => saveRule(rule)}
                    disabled={saving === rule.rule_type}
                    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-colors ${
                      saving === rule.rule_type
                        ? 'bg-gray-100 text-gray-400 cursor-wait'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {saving === rule.rule_type ? '...' : 'Kaydet'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-xs text-blue-700 leading-relaxed">
        <span className="font-bold">Not:</span>{' '}
        Değişiklikler CEO Cockpit karar uyarılarına anında yansır. Kural devre dışı bırakılırsa
        ilgili uyarılar hiç gösterilmez. Eşik değeri boş bırakılırsa sistem varsayılanı kullanılır.
      </div>
    </div>
  )
}
