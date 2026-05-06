// ── Flowra server-side validators ─────────────────────────────────────────────
// All validation happens server-side. Client sends raw data; server enforces rules.

import { CURRENCIES_EXTENDED } from '@/types'

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function requireString(v: unknown, field: string, maxLen = 500): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ValidationError(field, `${field} zorunludur`)
  }
  if (v.trim().length > maxLen) {
    throw new ValidationError(field, `${field} en fazla ${maxLen} karakter olabilir`)
  }
  return v.trim()
}

export function optionalString(v: unknown, field: string, maxLen = 500): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') throw new ValidationError(field, `${field} metin olmalıdır`)
  if (v.trim().length > maxLen) throw new ValidationError(field, `${field} en fazla ${maxLen} karakter`)
  return v.trim() || null
}

export function requirePositiveNumber(v: unknown, field: string): number {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) throw new ValidationError(field, `${field} sıfırdan büyük olmalıdır`)
  return n
}

export function requireNonNegativeNumber(v: unknown, field: string): number {
  const n = Number(v)
  if (!isFinite(n) || n < 0) throw new ValidationError(field, `${field} negatif olamaz`)
  return n
}

export function requireUUID(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) {
    throw new ValidationError(field, `${field} geçerli bir UUID olmalıdır`)
  }
  return v
}

export function optionalUUID(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === '') return null
  return requireUUID(v, field)
}

export function requireArray<T>(v: unknown, field: string): T[] {
  if (!Array.isArray(v)) throw new ValidationError(field, `${field} dizi olmalıdır`)
  return v as T[]
}

export function clampKdv(v: unknown): number {
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export function sanitizeCurrency(v: unknown): string {
  if (typeof v === 'string' && (CURRENCIES_EXTENDED as readonly string[]).includes(v.toUpperCase())) return v.toUpperCase()
  return 'TRY'
}

export function clampDiscount(v: unknown): number {
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export function validateProformaLine(line: unknown, idx: number) {
  if (typeof line !== 'object' || line === null) {
    throw new ValidationError('items', `Satır ${idx + 1} geçersiz`)
  }
  const l = line as Record<string, unknown>
  return {
    product_id:       optionalUUID(l.product_id, `items[${idx}].product_id`),
    name:             requireString(l.name, `items[${idx}].name`, 300),
    unit:             optionalString(l.unit, `items[${idx}].unit`, 50) ?? 'adet',
    unit_cost:        requireNonNegativeNumber(l.unit_cost ?? 0, `items[${idx}].unit_cost`),
    price:            requirePositiveNumber(l.price, `items[${idx}].price`),
    quantity:         requirePositiveNumber(l.quantity, `items[${idx}].quantity`),
    discount_percent: clampDiscount(l.discount_percent ?? 0),
    kdv:              clampKdv(l.kdv ?? 0),
    currency:         sanitizeCurrency(l.currency ?? 'TRY'),
    sort_order:       Number(l.sort_order ?? idx),
  }
}
