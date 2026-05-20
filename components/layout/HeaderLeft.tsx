'use client'
// HeaderLeft — reads pathname and returns the matching page title.
// Lives in the Header's left slot; replaces the static company-name text.

import { usePathname } from 'next/navigation'

const PATH_TITLES: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^\/dashboard\/finance/,         title: 'Finans Merkezi'      },
  { pattern: /^\/dashboard\/commercial/,      title: 'Ticari Akış'         },
  { pattern: /^\/dashboard\/ops/,              title: 'OPS Komuta'          },
  { pattern: /^\/dashboard\/operations/,      title: 'Operasyon'           },
  { pattern: /^\/dashboard\/partners/,        title: 'Ortak Finansmanı'    },
  { pattern: /^\/dashboard\/planning/,        title: 'Planlama'            },
  { pattern: /^\/dashboard\/insights/,        title: 'AI Analiz'           },
  { pattern: /^\/dashboard\/settings\/alerts/,title: 'Uyarı Kuralları'     },
  { pattern: /^\/dashboard\/settings/,        title: 'Ayarlar'             },
  { pattern: /^\/dashboard\/admin\/audit/,    title: 'Denetim Kütüğü'      },
  { pattern: /^\/dashboard\/admin\/users/,    title: 'Kullanıcılar'        },
  { pattern: /^\/dashboard\/admin\/roles/,    title: 'Roller'              },
  { pattern: /^\/dashboard\/admin/,           title: 'Yönetim'             },
  { pattern: /^\/dashboard\/proformas\/new/,  title: 'Yeni Proforma'       },
  { pattern: /^\/dashboard\/proformas\//,     title: 'Proforma'            },
  { pattern: /^\/dashboard\/sales\//,         title: 'Satış Detayı'        },
  { pattern: /^\/dashboard\/customers\//,     title: 'Müşteri Detayı'      },
  { pattern: /^\/dashboard\/cfo/,             title: 'CFO Merkezi'         },
  { pattern: /^\/dashboard\/reports/,         title: 'Raporlar'            },
  { pattern: /^\/dashboard\/simulation/,      title: 'Simülasyon'          },
  { pattern: /^\/dashboard$/,                 title: 'CEO Komuta'          },
]

export function HeaderLeft({ companyName }: { companyName: string | null }) {
  const pathname = usePathname()
  const match = PATH_TITLES.find(({ pattern }) => pattern.test(pathname))
  const title = match?.title ?? null

  return (
    <div className="hidden md:flex items-center gap-2 min-w-0">
      {title ? (
        <span className="text-sm font-bold text-[#0f172a] tracking-tight truncate">{title}</span>
      ) : companyName ? (
        <span className="text-[10px] font-semibold text-[#94a3b8] tracking-wide truncate">{companyName}</span>
      ) : null}
    </div>
  )
}
