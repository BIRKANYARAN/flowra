'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { Btn, ErrorBanner, sym } from '@/components/ui'
import { CURRENCIES, CURRENCY_LABELS, type Currency, type Customer, type Product, type CompanyBank } from '@/types'
import { calculateLine, calculateTotals, round2, type LineInput } from '@/lib/calc'
import { getSalePrice, getSaleCurrency, getLegacyProductCost } from '@/lib/product-adapter'
import { resolveCompanyId } from '@/lib/resolve-company'

const IL  = 'w-full border border-gray-200 rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'
const KDV_OPTS = [0, 1, 8, 10, 18, 20]

type Line = {
  product_id: string | null
  name:       string
  unit:       string
  unit_cost:  string
  price:      string
  quantity:   string
  discount:   string
  kdv:        string
  currency:   string
}

const emptyLine = (currency = 'TRY'): Line => ({
  product_id: null, name: '', unit: 'adet', unit_cost: '0',
  price: '', quantity: '1', discount: '0', kdv: '20', currency,
})

export default function NewProformaPage() {
  const router   = useRouter()
  const supabase = useSupabase()
  const dropRef  = useRef<HTMLDivElement>(null)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products,  setProducts]  = useState<Product[]>([])
  const [banks,     setBanks]     = useState<CompanyBank[]>([])
  const [custId,    setCustId]    = useState('')
  const [bankId,    setBankId]    = useState('')
  const [currency,  setCurrency]  = useState('TRY')
  const [validity,  setValidity]  = useState('1')
  const [notes,     setNotes]     = useState('')
  const [lines,     setLines]     = useState<Line[]>([emptyLine()])
  const [saving,    setSaving]    = useState(false)
  const [idempKey]  = useState(() => crypto.randomUUID())
  const [error,     setError]     = useState('')
  const [search,    setSearch]    = useState<{ idx: number; q: string; open: boolean }>({
    idx: -1, q: '', open: false,
  })

  useEffect(() => {
    async function load() {
      try {
        const result = await supabase.auth.getUser()
        if (result.error || !result.data || !result.data.user) return
        const user = result.data.user
        const companyId = await resolveCompanyId(user.id, supabase)

        const [cRes, pRes, bRes] = await Promise.all([
          supabase.from('customers').select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
          // Product picker — hide deactivated products (is_active=true).
          // Legacy rows default to true, so no existing flow breaks.
          supabase.from('products').select('*').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
          supabase.from('company_banks').select('*').eq('company_id', companyId).is('deleted_at', null).order('is_default', { ascending: false }),
        ])

        setCustomers((cRes.data || []) as Customer[])
        setProducts((pRes.data || []) as Product[])
        setBanks((bRes.data || []) as CompanyBank[])
        if (bRes.data && bRes.data.length > 0) {
          setBankId(bRes.data[0].id)
        }
      } catch (err) {
        console.error('[new proforma] load error:', err instanceof Error ? err.message : String(err))
      }
    }
    load()
  }, []) // eslint-disable-line

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setSearch(s => ({ ...s, open: false }))
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function setLine(i: number, patch: Partial<Line>) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  function selectProduct(i: number, p: Product) {
    const cost  = getLegacyProductCost(p)
    const price = getSalePrice(p)
    // Currency priority: product canonical → product legacy → proforma-level currency.
    // We never blind-fallback to 'TRY' here; the proforma's selected currency is the
    // correct scope-level default.
    const cur   = getSaleCurrency(p) ?? currency
    setLine(i, {
      product_id: p.id,
      name:       p.name,
      unit:       p.unit,
      unit_cost:  cost != null ? String(cost) : '0',
      price:      price != null ? String(price) : '',
      currency:   cur,
    })
    setSearch({ idx: -1, q: '', open: false })
  }

  function filteredProducts(q: string) {
    if (!q.trim()) return products
    const lower = q.toLowerCase()
    return products.filter(p => p.name.toLowerCase().includes(lower))
  }

  function calcTotals() {
    const inputs: LineInput[] = lines.map(l => ({
      price:            parseFloat(l.price) || 0,
      quantity:         parseFloat(l.quantity) || 0,
      discount_percent: parseFloat(l.discount) || 0,
      kdv:              parseFloat(l.kdv) || 0,
    }))
    const t = calculateTotals(inputs)
    return { subtotal: t.subtotal, kdvTotal: t.kdv_total, discountTotal: t.total_discount, grand: t.grand_total }
  }

  const { subtotal, kdvTotal, discountTotal, grand } = calcTotals()
  const S = sym(currency)

  async function save() {
    const validLines = lines.filter(l => l.name.trim() && parseFloat(l.price) > 0)
    if (!custId) { setError('Müşteri seçiniz.'); return }
    if (!validLines.length) { setError('En az bir geçerli ürün satırı ekleyin.'); return }

    setSaving(true)
    setError('')

    try {
      const cust = customers.find(c => c.id === custId)
      const res = await fetch('/api/proformas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          idempotency_key: idempKey,
          customer_id:   custId,
          bank_id:       bankId || null,
          customer_name: cust?.name || '',
          currency,
          validity_days: parseInt(validity) || 7,
          notes:         notes.trim() || null,
          items: validLines.map((l, i) => ({
            product_id: l.product_id,
            name:       l.name.trim(),
            unit:       l.unit || 'adet',
            unit_cost:  parseFloat(l.unit_cost) || 0,
            price:      parseFloat(l.price),
            quantity:   parseFloat(l.quantity) || 1,
            discount_percent: parseFloat(l.discount) || 0,
            kdv:        parseFloat(l.kdv) || 0,
            currency:   l.currency || currency,
            sort_order: i,
          })),
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Kayıt hatası')
        setSaving(false)
        return
      }
      const newId = (data as { id?: string }).id
      if (!newId || typeof newId !== 'string' || newId.trim() === '') {
        console.error('[new proforma] API returned no id:', data)
        setError('Proforma kaydedildi ancak yönlendirme başarısız oldu. Proformalar listesine dönün.')
        setSaving(false)
        return
      }
      router.push(`/dashboard/proformas/${newId.trim()}`)
    } catch (err) {
      console.error('[new proforma] save error:', err instanceof Error ? err.message : String(err))
      setError('Beklenmeyen hata oluştu. Lütfen tekrar deneyin.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/proformas" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← Proformalar
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-black">Yeni Proforma</h1>
      </div>

      {error && <div className="mb-4"><ErrorBanner msg={error} /></div>}

      <div className="grid grid-cols-3 gap-5">
        {/* Left: form */}
        <div className="col-span-2 space-y-5">

          {/* Step 1: Customer */}
          <div className="bg-white border border-gray-100 rounded p-5">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
              <span className="w-5 h-5 bg-primary-600 text-white rounded-full text-xs flex items-center justify-center font-black">1</span>
              Müşteri Bilgileri &amp; Seçenekler
            </h2>
            <div className="space-y-4">
              <div>
                <label className={LAB}>Müşteri *</label>
                <select className={IL} value={custId} onChange={e => setCustId(e.target.value)}>
                  <option value="">— Müşteri seçin —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {banks.length > 0 && (
                <div>
                  <label className={LAB}>Banka Hesabı</label>
                  <select className={IL} value={bankId} onChange={e => setBankId(e.target.value)}>
                    <option value="">— Banka seçin —</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.branch_name ? ' — ' + b.branch_name : ''} · {b.iban}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LAB}>Para Birimi</label>
                  <select
                    className={IL}
                    value={currency}
                    onChange={e => {
                      setCurrency(e.target.value)
                      setLines(ls => ls.map(l => ({ ...l, currency: e.target.value })))
                    }}
                  >
                    {CURRENCIES.map(c => (
                      <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LAB}>Geçerlilik (gün)</label>
                  <input
                    type="number" min="1" max="365"
                    className={IL}
                    value={validity}
                    onChange={e => setValidity(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Items */}
          <div className="bg-white border border-gray-100 rounded p-5">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
              <span className="w-5 h-5 bg-primary-600 text-white rounded-full text-xs flex items-center justify-center font-black">2</span>
              Ürünler / Hizmetler
            </h2>

            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
              <div className="col-span-3">Ürün Adı</div>
              <div className="col-span-2 text-right">Birim Fiyat ({sym(currency)})</div>
              <div className="col-span-1 text-center">İskonto (%)</div>
              <div className="col-span-1 text-center">Miktar</div>
              <div className="col-span-2 text-center">KDV Oranı (%)</div>
              <div className="col-span-3 text-right">Satır Tutarı</div>
            </div>

            <div className="space-y-2" ref={dropRef}>
              {lines.map((line, i) => {
                const lineCalc = calculateLine({
                  price: parseFloat(line.price) || 0,
                  quantity: parseFloat(line.quantity) || 0,
                  discount_percent: parseFloat(line.discount) || 0,
                  kdv: parseFloat(line.kdv) || 0,
                })
                const total = lineCalc.line_total
                const isOpen = search.open && search.idx === i
                const opts   = filteredProducts(search.idx === i ? search.q : line.name)

                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-3 relative">
                      <input
                        className={IL}
                        placeholder="Ürün adı..."
                        value={line.name}
                        onChange={e => {
                          setLine(i, { name: e.target.value, product_id: null })
                          setSearch({ idx: i, q: e.target.value, open: true })
                        }}
                        onFocus={() => setSearch({ idx: i, q: line.name, open: true })}
                      />
                      {isOpen && opts.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#e2e8f0] rounded shadow-sm max-h-48 overflow-y-auto">
                          {opts.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                              onMouseDown={e => { e.preventDefault(); selectProduct(i, p) }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{p.name}</span>
                                {(() => {
                                  const salePrice = getSalePrice(p)
                                  const cost      = getLegacyProductCost(p)
                                  if (salePrice == null || cost == null) return null
                                  const m = round2(((salePrice - cost) / salePrice) * 100)
                                  return (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      m < 10 ? 'bg-red-50 text-red-600'
                                    : m < 25 ? 'bg-amber-50 text-amber-600'
                                    :          'bg-emerald-50 text-emerald-700'
                                    }`}>
                                      %{m.toFixed(0)} marj
                                    </span>
                                  )
                                })()}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {(() => {
                                  const salePrice = getSalePrice(p)
                                  const cost      = getLegacyProductCost(p)
                                  const curCode   = getSaleCurrency(p) ?? currency
                                  return (
                                    <>
                                      {cost != null && <>{sym(curCode)}{cost.toFixed(2)} maliyet</>}
                                      {salePrice != null && <> · {sym(currency)}{salePrice.toFixed(2)} katalog</>}
                                      {' '}· {Number(p.stock_qty).toFixed(0)} stok
                                    </>
                                  )
                                })()}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number" min="0" step="0.01"
                        className={`${IL} text-right`}
                        placeholder="0.00"
                        value={line.price}
                        onChange={e => setLine(i, { price: e.target.value })}
                      />
                    </div>

                    <div className="col-span-1">
                      <input
                        type="number" min="0" max="100" step="0.1"
                        className={`${IL} text-center`}
                        placeholder="0"
                        value={line.discount}
                        onChange={e => setLine(i, { discount: e.target.value })}
                      />
                    </div>

                    <div className="col-span-1">
                      <input
                        type="number" min="0.01" step="0.01"
                        className={`${IL} text-center`}
                        value={line.quantity}
                        onChange={e => setLine(i, { quantity: e.target.value })}
                      />
                    </div>

                    <div className="col-span-2">
                      <select
                        className={IL}
                        value={line.kdv}
                        onChange={e => setLine(i, { kdv: e.target.value })}
                      >
                        {KDV_OPTS.map(k => (
                          <option key={k} value={k}>%{k}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-3 flex items-center justify-end gap-1 pt-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {total > 0 ? S + total.toFixed(2) : '—'}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}
                          className="ml-1 w-6 h-6 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-lg leading-none transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setLines(ls => [...ls, emptyLine(currency)])}
              className="mt-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 py-1.5 px-2 rounded hover:bg-primary-50 transition-colors"
            >
              <span className="font-black text-base">+</span> Satır Ekle
            </button>
          </div>

          {/* Step 3: Notes */}
          <div className="bg-white border border-gray-100 rounded p-5">
            <label className={LAB}>Notlar</label>
            <textarea
              className={`${IL} resize-none`}
              rows={2}
              placeholder="Müşteriye iletmek istediğiniz not..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Summary */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-100 rounded p-5 sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fiyat Özeti</h2>
              <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-0.5 rounded">{currency}</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ara Toplam</span>
                <span className="font-medium tabular-nums">{S}{subtotal.toFixed(2)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Toplam İskonto</span>
                  <span className="font-medium tabular-nums text-red-600">-{S}{discountTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Toplam KDV</span>
                <span className="font-medium tabular-nums">{S}{kdvTotal.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-100 pt-2.5">
                <div className="flex justify-between font-black text-base">
                  <span>Genel Toplam</span>
                  <span className="tabular-nums">{S}{grand.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <Btn onClick={save} disabled={saving} variant="primary" type="button">
                <span className="w-full">
                  {saving ? 'Kaydediliyor...' : 'Proformayı Kaydet →'}
                </span>
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
