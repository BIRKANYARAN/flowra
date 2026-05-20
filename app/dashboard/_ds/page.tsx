/**
 * Design System Showcase — dev-only route at /dashboard/_ds
 * Not linked from navigation. Blocked in production.
 */
'use client'


import { Btn, Card, Label, SectionHeader, DSInput, StatusBadge, Money, cn } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { FlowraKpiCard } from '@/components/ui-kit/FlowraKpiCard'
import { FlowraAlert }   from '@/components/ui-kit/FlowraAlert'

const ICON_KEYS = [
  'dashboard','stocks','proformas','sales','collections','expenses',
  'partners','simulation','analytics','settings','customers','products',
  'arrow-right','arrow-up','arrow-down','plus','search','refresh',
  'download','upload','logout','check','x','mail','phone','trash','edit','bell',
  'flame','coins','alert','info','filter',
]

const STATUSES = [
  'Taslak','Gönderildi','Onaylandı','Reddedildi','Dönüştürüldü',
  'Bekliyor','Ödendi','Gecikmiş','Tamamlandı',
  'draft','sent','accepted','rejected','converted',
]

export default function DesignSystemPage() {
  // Block in production — this page is dev-only and not linked from navigation.
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Bu sayfa sadece geliştirme ortamında kullanılabilir.
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-10">
      <header>
        <h1 className="font-black text-2xl tracking-tight text-gray-900">Flowra — Design System</h1>
        <p className="text-sm text-gray-500 mt-1">
          Internal showcase · <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/dashboard/_ds</code>
          · not linked from nav · delete before shipping
        </p>
      </header>

      {/* ── Color ramp ──────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Primary · Violet" />
        <div className="grid grid-cols-10 gap-2">
          {[50,100,200,300,400,500,600,700,800,900].map(w => (
            <div key={w} className="rounded-lg overflow-hidden border border-gray-200">
              <div className={`h-10 bg-primary-${w}`} />
              <div className="text-[10px] font-mono text-gray-500 text-center py-1">{w}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Buttons ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Buttons" />
        <Card>
          <div className="flex flex-wrap gap-3">
            <Btn variant="primary">Primary</Btn>
            <Btn variant="secondary">Secondary</Btn>
            <Btn variant="ghost">Ghost</Btn>
            <Btn variant="danger">Danger</Btn>
            <Btn variant="success">Success</Btn>
            <Btn variant="primary" disabled>Disabled</Btn>
            <Btn variant="primary" leftIcon={<Icon name="plus" size={14} />}>+ Yeni</Btn>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <Btn variant="primary" size="sm">Küçük</Btn>
            <Btn variant="primary" size="md">Orta</Btn>
            <Btn variant="primary" size="lg">Büyük</Btn>
          </div>
        </Card>
      </section>

      {/* ── Inputs ────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Inputs" />
        <Card>
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <DSInput label="Müşteri Adı" placeholder="örn. Demir İnşaat" />
            <DSInput label="Vergi No" prefix={<Icon name="search" size={14} />} placeholder="1234567890" />
            <DSInput label="Tutar" suffix="₺" placeholder="0,00" />
            <DSInput label="Hatalı Alan" error="Bu alan zorunludur" placeholder="..." />
          </div>
        </Card>
      </section>

      {/* ── Status badges ─────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Status Badges (TR + EN keys)" />
        <Card>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => <StatusBadge key={s} status={s} />)}
          </div>
        </Card>
      </section>

      {/* ── Money ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Money" />
        <Card>
          <div className="grid grid-cols-4 gap-6">
            {[
              { l: 'normal',   p: {} },
              { l: 'strong',   p: { emphasis: 'strong' as const } },
              { l: 'xl',       p: { emphasis: 'xl' as const } },
              { l: 'kpi',      p: { emphasis: 'kpi' as const, decimals: 0 } },
              { l: 'positive', p: { tone: 'positive' as const, emphasis: 'strong' as const } },
              { l: 'negative', p: { value: -4250, signed: true, tone: 'negative' as const, emphasis: 'strong' as const } },
              { l: 'USD',      p: { currency: '$', emphasis: 'strong' as const } },
              { l: 'EUR',      p: { currency: '€', emphasis: 'strong' as const } },
            ].map(({ l, p }) => (
              <div key={l}>
                <Label className="mb-1">{l}</Label>
                <Money value={'value' in p ? (p as {value:number}).value : 1234.56} {...p} />
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="KPI Cards" />
        <div className="grid grid-cols-4 gap-3">
          <FlowraKpiCard label="Ciro"         value={1248000} sub="Brüt marj %42" delta={12.3}  href="/dashboard/commercial?tab=sales" />
          <FlowraKpiCard label="Giderler"     value={340000}  sub="~₺28.000/ay"   tone="neutral"  />
          <FlowraKpiCard label="Bekleyen"     value={0}       sub="Tümü tahsil ✓" tone="neutral"  />
          <FlowraKpiCard label="Stok Değeri"  value={88000}   sub="FIFO maliyet"                  />
        </div>
      </section>

      {/* ── Alerts ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Alerts" />
        <div className="space-y-2">
          <FlowraAlert tone="orange"   text="KDV ödemesi: ₺12.345,67" sub="Beyan döneminde ödenecek" href="/dashboard/finance?tab=tax" />
          <FlowraAlert tone="danger"   text="Nakit ~18 günde tükenebilir" sub="Aylık ₺45K zarar, likit varlık ₺810K" href="/dashboard/operations?tab=expenses" />
          <FlowraAlert tone="warning"  text="Ortak dengesi bozuk" sub="₺8.400 eşitleme açığı var" href="/dashboard/partners" />
          <FlowraAlert tone="info"     text="3 satış tahsilat bekliyor: ₺92.000" sub="Tahsilat sayfasından ödeme durumunu güncelleyin" href="/dashboard/commercial?tab=collections" />
        </div>
        <div className="mt-3 space-y-2">
          <SectionHeader label="Card variant" />
          <div className="grid grid-cols-2 gap-3">
            <FlowraAlert variant="card" tone="warning" text="Ortak dengesi bozuk" sub="₺8.400 eşitleme açığı" />
            <FlowraAlert variant="card" tone="info"    text="3 satış tahsilat bekliyor" sub="₺92.000 ödeme bekleniyor" />
          </div>
        </div>
      </section>

      {/* ── Icons ────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Icons (Lucide + emoji fallback)" />
        <Card>
          <div className="grid grid-cols-8 gap-3">
            {ICON_KEYS.map(k => (
              <div key={k} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50">
                <Icon name={k} size={20} className="text-gray-700" />
                <span className="text-[10px] font-mono text-gray-400 text-center">{k}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Label className="mb-2">Emoji passthrough</Label>
            <div className="flex gap-4 items-center">
              <Icon name="🔥" size={20} />
              <Icon name="📦" size={20} />
              <Icon name="⚙️" size={20} />
              <Icon name="unknown-key" size={20} fallback="?" />
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}
