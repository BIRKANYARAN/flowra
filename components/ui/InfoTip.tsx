// InfoTip — tiny inline "ⓘ" that explains a financial term on hover/focus.
//
// Usage:
//   <InfoTip k="HHI" />                     → ⓘ with the glossary definition
//   <InfoTip text="Özel açıklama" />        → ⓘ with custom text
//
// Uses the native `title` attribute so it works with zero JS, on keyboard
// focus, and is screen-reader friendly. Server-component safe (no 'use client').

import React from 'react'

/** Plain-Turkish definitions for the abbreviations/jargon used across the app. */
export const GLOSSARY: Record<string, string> = {
  HHI:    'Herfindahl-Hirschman Endeksi — müşteri/tedarikçi yoğunlaşma ölçüsü. 0’a yakın = dağınık ve sağlıklı, 1’e yakın = tek bir tarafa riskli bağımlılık.',
  CCC:    'Nakit Dönüş Döngüsü — paranın stok+alacak olarak bağlı kaldığı net gün sayısı (DSO + DIO − DPO). Düşük olması iyidir: nakit daha hızlı döner.',
  DSO:    'Tahsilat Süresi — bir satışın ortalama kaç günde tahsil edildiği. Düşük = hızlı tahsilat.',
  DIO:    'Stokta Bekleme Süresi — bir ürünün ortalama kaç gün stokta kaldığı. Düşük = hızlı satış.',
  DPO:    'Ödeme Süresi — tedarikçiye ortalama kaç günde ödendiği. Yüksek = nakdi daha uzun elde tutma.',
  DSR:    'Borç Servis Oranı — nakit akışının ne kadarının borç ödemesine gittiği. Yüksek = borç baskısı.',
  Runway: 'Nakit Ömrü — mevcut nakitle, bugünkü harcama hızında kaç ay dayanılabileceği.',
  Burn:   'Nakit Yakımı — aylık net nakit çıkışı (giderler − gelirler).',
  EBITDA: 'Faiz, vergi ve amortisman öncesi kâr — işin esas faaliyet kârlılığını gösterir.',
  FIFO:   'İlk Giren İlk Çıkar — stok maliyetini en eski alımlardan başlayarak hesaplama yöntemi.',
  WAC:    'Ağırlıklı Ortalama Maliyet — stok birim maliyetinin tüm alımların ortalamasıyla hesaplanması.',
  WACD:   'Ağırlıklı Ortalama Borç Maliyeti — tüm kredilerin ortalama yıllık faiz yükü.',
  YTD:    'Yıl Başından Bugüne — 1 Ocak’tan bugüne kümülatif toplam.',
  MoM:    'Aydan Aya — önceki aya göre değişim.',
  YoY:    'Yıldan Yıla — geçen yılın aynı dönemine göre değişim.',
}

export function InfoTip({ k, text, className = '' }: { k?: string; text?: string; className?: string }) {
  const tip = text ?? (k ? GLOSSARY[k] : undefined)
  if (!tip) return null
  return (
    <span
      title={tip}
      tabIndex={0}
      role="note"
      aria-label={tip}
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#e8eaef] text-[#64748b] text-[9px] font-bold leading-none cursor-help align-middle select-none hover:bg-[#cbd5e1] hover:text-[#334155] transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${className}`}
    >
      i
    </span>
  )
}
