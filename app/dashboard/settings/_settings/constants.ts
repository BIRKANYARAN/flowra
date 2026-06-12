// Shared settings tokens + constants — extracted verbatim from settings/page.tsx
// so the page and its extracted cards reference a single source.

// DS-aligned style tokens (primary instead of indigo, consistent radius)
export const IL  = 'w-full border border-[#e2e8f0] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors'
export const LAB = 'block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5'

export type Msg = { text: string; kind: 'success' | 'error' | 'info' }

export function flash(setter: (m: Msg | null) => void, text: string, kind: Msg['kind'] = 'success') {
  setter({ text, kind })
  if (kind !== 'error') setTimeout(() => setter(null), 4500)
}

// ── Belge Kimliği — sabit tanımlar ──────────────────────────────────────────
export const BRAND_PALETTES = [
  { id: 'charcoal',   label: 'Antrasit',     swatch: '#1f2937' },
  { id: 'navy',       label: 'Lacivert',     swatch: '#0f172a' },
  { id: 'slate',      label: 'Çelik',        swatch: '#1e293b' },
  { id: 'deep-green', label: 'Yeşil',        swatch: '#062e1a' },
  { id: 'burgundy',   label: 'Bordo',        swatch: '#44061d' },
] as const

export const DOCUMENT_STYLES = [
  { id: 'corporate',  label: 'Kurumsal',   desc: 'Başlık bant, tam düzen' },
  { id: 'executive',  label: 'Yönetici',   desc: 'Geniş boşluk, editoryal' },
  { id: 'industrial', label: 'Endüstriyel',desc: 'Yoğun, fonksiyonel' },
  { id: 'minimal',    label: 'Minimal',    desc: 'Hafif çizgi, maksimum boşluk' },
] as const
