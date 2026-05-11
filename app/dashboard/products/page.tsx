'use client'

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { CURRENCIES_EXTENDED, type Product } from '@/types'
import { getSalePrice, getSaleCurrency, getLegacyProductCost } from '@/lib/product-adapter'
import { resolveCompanyId } from '@/lib/resolve-company'

const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'
const MOVE_TYPES   = [
  { value: 'purchase',   label: 'Satın Alma'    },
  { value: 'adjustment', label: 'Düzeltme'       },
  { value: 'return',     label: 'İade'           },
  { value: 'write_off',  label: 'Fire / Zarar'   },
]
const EMPTY = {
  name: '', sku: '', unit: 'adet', unit_cost: '0',
  cost_currency: 'TRY', stock_qty: '0', stock_alert_qty: '0', description: '',
  catalog_price: '0', entry_date: new Date().toISOString().slice(0, 10),
}

function genKey() { return crypto.randomUUID() }

export default function ProductsPage() {
  const supabase = useSupabase()

  const [list,     setList]     = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState({ ...EMPTY })
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')

  // ── Stock adjustment modal ────────────────────────────────────────────────
  const [adjProduct,  setAdjProduct]  = useState<Product | null>(null)
  const [adjQty,      setAdjQty]      = useState('')
  const [adjType,     setAdjType]     = useState('adjustment')
  const [adjNotes,    setAdjNotes]    = useState('')
  const [adjSaving,   setAdjSaving]   = useState(false)
  const [adjErr,      setAdjErr]      = useState('')
  const [adjIdemp,    setAdjIdemp]    = useState(genKey)

  // Lot-based cost summary per product: weighted average of active lots
  const [lotCosts, setLotCosts] = useState<Record<string, { avgCost: number; lotCount: number; currency: string }>>({})

  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)
    const [prodRes, lotRes] = await Promise.all([
      supabase.from('products').select('*')
        .eq('company_id', companyId).is('deleted_at', null).order('name'),
      supabase.from('stock_lots')
        .select('product_id, unit_cost, qty_remaining, cost_currency')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),
    ])
    setList((prodRes.data ?? []) as Product[])

    // Compute weighted average cost from active lots per product
    const costs: Record<string, { totalCost: number; totalQty: number; lotCount: number; currency: string }> = {}
    for (const lot of (lotRes.data ?? []) as Array<{ product_id: string; unit_cost: number; qty_remaining: number; cost_currency: string }>) {
      const pid = lot.product_id
      const uc  = Number(lot.unit_cost) || 0
      const qr  = Number(lot.qty_remaining) || 0
      if (!costs[pid]) costs[pid] = { totalCost: 0, totalQty: 0, lotCount: 0, currency: lot.cost_currency || 'TRY' }
      costs[pid].totalCost += uc * qr
      costs[pid].totalQty  += qr
      costs[pid].lotCount  += 1
    }
    const summary: Record<string, { avgCost: number; lotCount: number; currency: string }> = {}
    for (const [pid, c] of Object.entries(costs)) {
      summary[pid] = {
        avgCost:  c.totalQty > 0 ? Math.round((c.totalCost / c.totalQty) * 100) / 100 : 0,
        lotCount: c.lotCount,
        currency: c.currency,
      }
    }
    setLotCosts(summary)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Product CRUD ──────────────────────────────────────────────────────────
  function openNew() { setForm({ ...EMPTY }); setEditId(null); setFormErr(''); setShowForm(true) }
  function openEdit(p: Product) {
    setForm({
      name: p.name, sku: p.sku || '', unit: p.unit,
      unit_cost: String(p.unit_cost), cost_currency: p.cost_currency,
      stock_qty: String(p.stock_qty), stock_alert_qty: String(p.stock_alert_qty),
      description: p.description || '',
      catalog_price: p.catalog_price != null ? String(p.catalog_price) : '0',
      entry_date: new Date().toISOString().slice(0, 10),
    })
    setEditId(p.id); setFormErr(''); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditId(null); setForm({ ...EMPTY }); setFormErr('') }

  async function save() {
    if (!form.name.trim()) { setFormErr('Ürün adı zorunludur'); return }
    setSaving(true); setFormErr('')

    const payload = {
      ...(editId ? { id: editId } : {}),
      name:            form.name.trim(),
      sku:             form.sku.trim() || null,
      unit:            form.unit.trim() || 'adet',
      unit_cost:       parseFloat(form.unit_cost)       || 0,
      catalog_price:   parseFloat(form.catalog_price)   || 0,
      cost_currency:   form.cost_currency,
      stock_qty:       editId ? undefined : (parseFloat(form.stock_qty) || 0),
      stock_alert_qty: parseFloat(form.stock_alert_qty) || 0,
      description:     form.description.trim() || null,
      entry_date:      editId ? undefined : form.entry_date,
    }

    const res  = await fetch('/api/products', {
      method:  editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) { setFormErr(json.error ?? 'Kayıt hatası'); setSaving(false); return }
    closeForm(); setSaving(false); load()
  }

  async function del(id: string) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      setFormErr('Oturum süresi doldu, lütfen yeniden giriş yapın.')
      return
    }
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)
    const { error } = await supabase.from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id).eq('company_id', companyId)
    if (error) { setFormErr(error.message); return }
    load()
  }

  // ── Stock adjustment ──────────────────────────────────────────────────────
  function openAdj(p: Product) {
    setAdjProduct(p)
    setAdjQty('')
    setAdjType('adjustment')
    setAdjNotes('')
    setAdjErr('')
    setAdjIdemp(genKey())   // fresh key each time modal opens
  }

  function closeAdj() { setAdjProduct(null); setAdjErr('') }

  async function submitAdj() {
    const qty = parseFloat(adjQty)
    if (!isFinite(qty) || qty === 0) { setAdjErr('Geçerli bir miktar girin.'); return }
    if (!adjProduct) return

    setAdjSaving(true); setAdjErr('')

    const res  = await fetch('/api/products', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        idempotency_key: adjIdemp,
        product_id:      adjProduct.id,
        qty_change:      qty,
        reference_type:  adjType,
        notes:           adjNotes.trim() || null,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setAdjErr(json.error ?? 'Stok güncellenemedi')
      setAdjSaving(false)
      return
    }

    closeAdj()
    setAdjSaving(false)
    load()
  }

  const f = (k: keyof typeof EMPTY) => ({
    value:    form[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value })),
  })

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Ürünler</h1>
          <p className="text-sm text-gray-500 mt-0.5">{list.length} ürün</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard/catalog"
            className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
            Katalog Görünümü →
          </a>
          {!showForm && (
            <button onClick={openNew}
              className="bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
              + Yeni Ürün
            </button>
          )}
        </div>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 space-y-4">
          <h3 className="font-bold text-sm border-b border-gray-100 pb-3">
            {editId ? 'Ürünü Düzenle' : 'Yeni Ürün'}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={LAB}>Ürün Adı *</label>
              <input className={IL} autoFocus {...f('name')} />
            </div>
            <div>
              <label className={LAB}>SKU / Kod</label>
              <input className={IL} placeholder="URN-001" {...f('sku')} />
            </div>
            <div>
              <label className={LAB}>Birim</label>
              <input className={IL} placeholder="adet" {...f('unit')} />
            </div>
            <div>
              <label className={LAB}>Birim Maliyet</label>
              <div className="flex gap-2">
                <input type="number" min="0" step="0.0001" className={IL} {...f('unit_cost')} />
                <select className="border border-gray-200 rounded-xl px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-40000 bg-white" {...f('cost_currency')}>
                  {CURRENCIES_EXTENDED.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {!editId && (
              <div>
                <label className={LAB}>Başlangıç Stok</label>
                <input type="number" min="0" step="0.001" className={IL} {...f('stock_qty')} />
              </div>
            )}
            <div>
              <label className={LAB}>Stok Uyarı Seviyesi</label>
              <input type="number" min="0" step="0.001" className={IL} {...f('stock_alert_qty')} />
            </div>
            <div>
              <label className={LAB}>Katalog Fiyatı</label>
              <input type="number" min="0" step="0.01" className={IL} {...f('catalog_price')} />
            </div>
            {!editId && (
              <div>
                <label className={LAB}>Giriş Tarihi</label>
                <input type="date" className={IL} {...f('entry_date')} />
              </div>
            )}
          </div>

          <div>
            <label className={LAB}>Açıklama</label>
            <textarea className={`${IL} resize-none`} rows={2} {...f('description')} />
          </div>

          {formErr && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {formErr}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 transition-colors">
              {saving ? 'Kaydediliyor...' : editId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button onClick={closeForm}
              className="border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50/60 transition-colors">
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Products list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {list.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">🏷️</div>
            <p className="text-sm">Henüz ürün eklenmedi.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 border-b border-gray-100">
              <div className="col-span-3">Ürün</div>
              <div className="col-span-2 text-right">Ortalama Maliyet</div>
              <div className="col-span-2 text-right">Katalog Fiyatı</div>
              <div className="col-span-2 text-right">Stok</div>
              <div className="col-span-3 text-right">İşlem</div>
            </div>
            <div className="divide-y divide-gray-50">
              {list.map(p => {
                const isLow = Number(p.stock_alert_qty) > 0 &&
                              Number(p.stock_qty) <= Number(p.stock_alert_qty)
                return (
                  <div key={p.id}
                    className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                    <div className="col-span-3 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {p.sku && <span>SKU: {p.sku} · </span>}
                        {p.unit}
                      </div>
                    </div>

                    <div className="col-span-2 text-right text-sm tabular-nums">
                      {lotCosts[p.id] ? (
                        <>
                          <span className="text-gray-700">{lotCosts[p.id].currency}&nbsp;</span>
                          <span className="font-medium">{lotCosts[p.id].avgCost.toFixed(2)}</span>
                          <div className="text-xs text-gray-400">{lotCosts[p.id].lotCount} lot</div>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-700">{getSaleCurrency(p) ?? '—'}&nbsp;</span>
                          <span className="font-medium text-gray-400">{(getLegacyProductCost(p) ?? 0).toFixed(2)}</span>
                          <div className="text-xs text-gray-300">lot yok</div>
                        </>
                      )}
                    </div>

                    <div className="col-span-2 text-right text-sm tabular-nums font-medium text-gray-600">
                      {(getSalePrice(p) ?? 0).toFixed(2)}
                    </div>

                    <div className={`col-span-2 text-right text-sm font-bold tabular-nums ${isLow ? 'text-amber-600' : 'text-gray-800'}`}>
                      {(Number(p.stock_qty) || 0).toFixed(2)} {p.unit}
                      {isLow && <span className="ml-1 text-xs">⚠</span>}
                    </div>

                    <div className="col-span-3 flex justify-end gap-1">
                      <button onClick={() => openAdj(p)}
                        className="text-xs text-primary-600 hover:text-primary-80000 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors font-medium">
                        ± Stok
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                        Düzenle
                      </button>
                      <button onClick={() => del(p.id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        Sil
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Stock adjustment modal ─────────────────────────────────────── */}
      {adjProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget && !adjSaving) closeAdj() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-base">Stok Hareketi</h3>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{adjProduct.name}</p>
              </div>
              <button
                onClick={closeAdj}
                disabled={adjSaving}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
              >×</button>
            </div>

            {/* Current stock display */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
              <span className="text-sm text-gray-500">Güncel Stok</span>
              <span className="text-lg font-black tabular-nums">
                {(Number(adjProduct.stock_qty) || 0).toFixed(2)} {adjProduct.unit}
              </span>
            </div>

            <div className="space-y-4">
              {/* Movement type */}
              <div>
                <label className={LAB}>Hareket Tipi</label>
                <select
                  className={IL}
                  value={adjType}
                  onChange={e => setAdjType(e.target.value)}
                  disabled={adjSaving}
                >
                  {MOVE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Quantity change */}
              <div>
                <label className={LAB}>
                  Miktar Değişimi
                  <span className="ml-1 text-gray-400 normal-case font-normal">
                    (giriş için + , çıkış için −)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="+10 veya -5"
                  className={IL}
                  value={adjQty}
                  onChange={e => setAdjQty(e.target.value)}
                  disabled={adjSaving}
                  autoFocus
                />
                {adjQty && isFinite(parseFloat(adjQty)) && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Sonuç: {(Number(adjProduct.stock_qty || 0) + (parseFloat(adjQty) || 0)).toFixed(2)} {adjProduct.unit}
                    {(Number(adjProduct.stock_qty) + parseFloat(adjQty)) < 0 && (
                      <span className="ml-2 text-red-500 font-semibold">⚠ Negatife düşer!</span>
                    )}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className={LAB}>Not (opsiyonel)</label>
                <input
                  className={IL}
                  placeholder="Hareket nedeni..."
                  value={adjNotes}
                  onChange={e => setAdjNotes(e.target.value)}
                  disabled={adjSaving}
                />
              </div>
            </div>

            {adjErr && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {adjErr}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitAdj}
                disabled={adjSaving || !adjQty || !isFinite(parseFloat(adjQty)) || parseFloat(adjQty) === 0}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-primary-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {adjSaving
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Kaydediliyor...</>
                  : 'Kaydet'
                }
              </button>
              <button
                onClick={closeAdj}
                disabled={adjSaving}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
