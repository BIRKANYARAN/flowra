// ── /dashboard/accounting/integrations — Bağlanabilir Sistemler ───────────────
//
// Read-only catalogue of the accounting / e-invoice / bank systems Flowra will
// read from. Renders the connector registry (lib/connectors) — no provider is
// wired yet, so every row is a status badge, not a live connection. This makes
// the "decision layer over your existing systems" positioning visible in-product.
//
// See docs/architecture/CONNECTOR_LAYER.md.

import { ACCOUNTING_PROVIDERS, BANK_SOURCES, type ConnectorStatus, type AuthModel } from '@/lib/connectors'

export const metadata = { title: 'Entegrasyonlar' }

const STATUS_BADGE: Record<ConnectorStatus, { label: string; cls: string }> = {
  planned: { label: 'Yakında', cls: 'bg-[#f1f5f9] text-[#64748b]' },
  beta:    { label: 'Beta',    cls: 'bg-warn-light text-warn-text' },
  live:    { label: 'Aktif',   cls: 'bg-pos-light text-pos-text' },
}

const AUTH_LABEL: Record<AuthModel, string> = {
  oauth2:      'OAuth2 API',
  api_key:     'API anahtarı',
  on_prem_sql: 'Yerinde SQL / ajan',
  soap_ws:     'Web servisi',
  file:        'Dosya yükleme',
}

const READ_LABEL: Record<string, string> = {
  invoices: 'Fatura', expenses: 'Gider', customers: 'Müşteri', suppliers: 'Tedarikçi', collections: 'Tahsilat',
}

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Hero */}
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Entegrasyonlar</div>
        <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">Bağlanabilir Sistemler</h1>
        <p className="text-sm text-[#94a3b8] mt-1 max-w-2xl">
          Flowra muhasebe programınızın yerine geçmez — <strong className="text-[#475569]">onu okur</strong>. Faturalarınızı,
          carilerinizi, tahsilatlarınızı ve banka hareketlerinizi mevcut sisteminizden alıp kararlarınıza dönüştürür.
          Entegrasyonlar <strong className="text-[#475569]">salt-okunur</strong> başlar.
        </p>
      </div>

      {/* Accounting / e-invoice */}
      <section className="flex flex-col gap-2.5">
        <div className="fl-eyebrow text-[#94a3b8]">Muhasebe & e-Fatura</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...ACCOUNTING_PROVIDERS].sort((a, b) => a.buildOrder - b.buildOrder).map(p => {
            const badge = STATUS_BADGE[p.status]
            return (
              <div key={p.id} className="fl-card flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#0f172a]">{p.label}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                </div>
                <p className="text-[11px] text-[#64748b] leading-snug">{p.note}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[#94a3b8]">{AUTH_LABEL[p.auth]}</span>
                  <span className="text-[#cbd5e1]">·</span>
                  {p.reads.map(r => (
                    <span key={r} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#f8fafc] text-[#64748b] border border-[#edeef2]">
                      {READ_LABEL[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Bank */}
      <section className="flex flex-col gap-2.5">
        <div className="fl-eyebrow text-[#94a3b8]">Banka</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...BANK_SOURCES].sort((a, b) => a.buildOrder - b.buildOrder).map(b => {
            const badge = STATUS_BADGE[b.status]
            return (
              <div key={b.id} className="fl-card flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#0f172a]">{b.label}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                </div>
                <p className="text-[11px] text-[#64748b] leading-snug">{b.note}</p>
                <span className="text-[9px] font-bold uppercase tracking-wide text-[#94a3b8] mt-0.5">{AUTH_LABEL[b.auth]}</span>
              </div>
            )
          })}
        </div>
      </section>

      <p className="text-[11px] text-[#94a3b8] border-t border-[#edeef2] pt-3">
        Önce okuma, sonra fatura–banka mutabakatı, sonra Flowra Financial Core. Mimarinin tamamı:
        <code className="text-[10px] ml-1">docs/architecture/CONNECTOR_LAYER.md</code>
      </p>
    </div>
  )
}
