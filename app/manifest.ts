import type { MetadataRoute } from 'next'

// PWA manifest — makes Flowra installable ("add to home screen") with brand chrome,
// for owners who check cash/collections daily on their phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Flowra — Finansal İşletim Sistemi',
    short_name:       'Flowra',
    description:      'Türk KOBİ için finansal işletim sistemi — nakit, kâr, tahsilat, vergi.',
    start_url:        '/dashboard',
    display:          'standalone',
    background_color: '#0f172a',
    theme_color:      '#5b21b6',
    lang:             'tr',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
