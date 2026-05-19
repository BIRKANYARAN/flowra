'use client'

// ── SaleCreateDrawer — slide-in drawer for creating a direct sale ─────────────

import { useState, useCallback, useEffect } from 'react'
import { formatTRY } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string
  quantity:    string
  unit_price:  string
  kdv_rate:    number
}

const EMPTY_ITEM: LineItem = {
  description: '',
  quantity:    '1',
  unit_price:  '',
  kdv_rate:    20,
}

export interface SaleCreateDrawerProps {
  onClose:   () => void
  onSuccess: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function itemRowTotal(item: LineItem): number {
  const qty   = parseFloat(item.quantity)  || 0
  const price = parseFloat(item.unit_price) || 0
  return qty * price * (1 + item.kdv_rate / 100)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SaleCreateDrawer({ onClose, onSuccess }: SaleCreateDrawerProps) {
  const today = new Date().toISOString().slice(0, 10)

  const [customerName, setCustomerName] = useState('')
  const [saleDate,     setSaleDate]     = useState(today)
  const [dueDate,      setDueDate]      = useState('')
  const [notes,        setNotes]        = useState('')
  const [items,        setItems]        = useState<LineItem[]>([{ ...EMPTY_ITEM }])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  // ESC closes the drawer (mirrors PaymentDrawer behaviour)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  // ── Item helpers ─────────────────────────────────────────────────────────────

  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }

  function updateItem(idx: number, key: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [key]: value } : item,
    ))
    setError('')
  }

  // ── Totals ────────────────────────────────────────────────────────────────────

  const subtotal = items.reduce((s, item) => {
    const qty   = parseFloat(item.quantity)  || 0
    const price = parseFloat(item.unit_price) || 0
    return s + qty * price
  }, 0)

  const kdvTotal = items.reduce((s, item) => {
    const qty   = parseFloat(item.quantity)  || 0
    const price = parseFloat(item.unit_price) || 0
    return s + qty * price * (item.kdv_rate / 100)
  }, 0)

  const grandTotal = subtotal + kdvTotal

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!customerName.trim() || customerName.trim().length < 2) {
      setError('Müşteri adı en az 2 karakter olmalıdır')
      return
    }
    if (!saleDate) {
      setError('Satış tarihi zorunludur')
      return
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.description.trim()) {
        setError(`Kalem ${i + 1}: Açıklama zorunludur`)
        return
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        setError(`Kalem ${i + 1}: Miktar sıfırdan büyük olmalıdır`)
        return
      }
      if (!item.unit_price || parseFloat(item.unit_price) <= 0) {
        setError(`Kalem ${i + 1}: Birim fiyat sıfırdan büyük olmalıdır`)
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch('/api/sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customer_name: customerName.trim(),
          currency:      'TRY',
          sale_date:     saleDate,
          due_date:      dueDate || undefined,
          notes:         notes.trim() || undefined,
          items: items.map(item => ({
            description: item.description.trim(),
            quantity:    parseFloat(item.quantity),
            unit_price:  parseFloat(item.unit_price),
            kdv_rate:    item.kdv_rate,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Satış kaydedilemedi')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('Bağlantı hatası. Tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }, [customerName, saleDate, dueDate, notes, items, onSuccess, onClose])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Yeni Satış"
        className="fixed right-0 top-0 h-full w-[480px] bg-white z-50 border-l border-[#e2e8f0] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e2e8f0] flex-shrink-0">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 leading-none">
              Ticari
            </div>
            <div className="text-base font-black text-gray-900 mt-1">Yeni Satış</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 -mr-1 leading-none text-lg"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* ── Section 1: Müşteri ─────────────────────────────────────────── */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
              Müşteri Bilgileri
            </div>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="sc-customer"
                  className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
                >
                  Müşteri Adı <span className="text-neg">*</span>
                </label>
                <input
                  id="sc-customer"
                  type="text"
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); setError('') }}
                  placeholder="Müşteri veya firma adı"
                  className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="sc-sale-date"
                    className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
                  >
                    Satış Tarihi <span className="text-neg">*</span>
                  </label>
                  <input
                    id="sc-sale-date"
                    type="date"
                    value={saleDate}
                    onChange={e => { setSaleDate(e.target.value); setError('') }}
                    className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="sc-due-date"
                    className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
                  >
                    Ödeme Vadesi
                  </label>
                  <input
                    id="sc-due-date"
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Kalemler ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Kalemler
              </div>
              <button
                type="button"
                onClick={addItem}
                className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 hover:underline transition-colors"
              >
                + Kalem Ekle
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-[#f8fafc]/60 border border-[#e2e8f0] rounded p-3 space-y-2"
                >
                  {/* Description row */}
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      placeholder="Açıklama (ürün/hizmet)"
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      className="flex-1 border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-gray-300 hover:text-neg transition-colors text-lg leading-none pt-2 flex-shrink-0"
                        aria-label="Kalemi sil"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Qty / Price / KDV row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                        Miktar
                      </label>
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        placeholder="1"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                        Birim Fiyat (₺)
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={item.unit_price}
                        onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                        className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                        KDV
                      </label>
                      <select
                        value={item.kdv_rate}
                        onChange={e => updateItem(idx, 'kdv_rate', Number(e.target.value))}
                        className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
                      >
                        <option value={0}>%0</option>
                        <option value={10}>%10</option>
                        <option value={20}>%20</option>
                      </select>
                    </div>
                  </div>

                  {/* Row total */}
                  {itemRowTotal(item) > 0 && (
                    <div className="text-right text-xs text-gray-400 font-mono">
                      Kalem toplamı: <span className="font-semibold text-gray-700">{formatTRY(itemRowTotal(item))}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals strip */}
            {grandTotal > 0 && (
              <div className="mt-3 bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Ara Toplam</span>
                  <span className="font-mono font-semibold text-gray-700">{formatTRY(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>KDV</span>
                  <span className="font-mono font-semibold text-gray-700">{formatTRY(kdvTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-gray-900 pt-1 border-t border-[#e2e8f0]">
                  <span>TOPLAM</span>
                  <span className="font-mono">{formatTRY(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Notes ────────────────────────────────────────────── */}
          <div>
            <label
              htmlFor="sc-notes"
              className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
            >
              Notlar
            </label>
            <textarea
              id="sc-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="İsteğe bağlı açıklama…"
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-neg font-semibold bg-neg-light border border-neg-light rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 pb-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#e2e8f0] text-gray-500 py-2.5 rounded text-sm font-semibold hover:bg-[#f8fafc] transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving || grandTotal <= 0}
              className="flex-1 bg-primary-600 text-white py-2.5 rounded text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Kaydediliyor…' : 'Satış Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
