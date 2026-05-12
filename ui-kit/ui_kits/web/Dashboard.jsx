/* global React, KpiCard, Alert, Card, Label, StatusBadge, Money, Icon, Btn */
const { useState } = React;

function FxWidget() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3 flex items-center gap-6 flex-wrap">
      <Label>Güncel Kur</Label>
      <div className="text-center">
        <Label className="!text-gray-500">USD / TRY</Label>
        <div className="text-lg font-black tabular-nums tracking-tight">₺34,7218</div>
      </div>
      <div className="w-px h-8 bg-gray-100" />
      <div className="text-center">
        <Label className="!text-gray-500">EUR / TRY</Label>
        <div className="text-lg font-black tabular-nums tracking-tight">₺37,1490</div>
      </div>
      <div className="ml-auto text-right text-[10px] text-gray-400 leading-snug">
        <div>Kaynak: TCMB</div>
        <div>Kur: 06/05/2026</div>
        <div>Güncellendi: 06/05/2026 09:14</div>
      </div>
      <Btn size="sm" variant="secondary" leftIcon={<Icon name="refresh-cw" size={12} />}>Yenile</Btn>
    </div>
  );
}

const ALERTS = [
  { tone: 'orange',  text: 'KDV ödemesi: ₺12.345,67',         sub: 'Beyan döneminde ödenecek' },
  { tone: 'danger',  text: 'Nakit ~18 günde tükenebilir',      sub: 'Aylık ₺45K zarar, likit ₺810K' },
  { tone: 'info',    text: '3 satış tahsilat bekliyor: ₺92.000', sub: 'Tahsilat sayfasından durumu güncelleyin' },
];

const RECENT_PROFORMAS = [
  { id: 'PRF-2026-0142', customer: 'Demir İnşaat A.Ş.', vat: '1234567890', amount: 284500, status: 'accepted' },
  { id: 'PRF-2026-0141', customer: 'Yıldız Tekstil',     vat: '9876543210', amount: 92180.40, status: 'converted' },
  { id: 'PRF-2026-0140', customer: 'Akın Mobilya',       vat: '5566778899', amount: 14220, status: 'unpaid' },
  { id: 'PRF-2026-0139', customer: 'Mavi Lojistik Ltd.', vat: '4433221100', amount: 53000, status: 'sent' },
];

function Dashboard({ onOpenProforma }) {
  return (
    <div className="space-y-6">
      <FxWidget />

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ciro"      value={1248000} sub="Brüt marj %42"        delta={12.3} />
        <KpiCard label="Giderler"  value={340000}  sub="~₺28.000 / ay"        />
        <KpiCard label="Bekleyen"  value={92000}   sub="3 satış · tahsilat"   />
        <KpiCard label="Net Kâr"   value={-45200}  sub="Reel · faiz dahil"    delta={-8.4} tone="negative" />
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {ALERTS.map((a, i) => <Alert key={i} {...a} onClick={() => {}} />)}
      </div>

      {/* Recent table */}
      <Card padding="none">
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Son Proformalar</h3>
            <p className="text-xs text-gray-400 mt-0.5">Son 7 gün</p>
          </div>
          <Btn size="sm" variant="ghost" rightIcon={<span className="text-xs">→</span>}>Tümünü gör</Btn>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Müşteri</th>
              <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">No</th>
              <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Durum</th>
              <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_PROFORMAS.map((p) => (
              <tr key={p.id} onClick={() => onOpenProforma(p.id)} className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer">
                <td className="px-5 py-3">
                  <div className="font-semibold text-gray-900">{p.customer}</div>
                  <div className="text-[11px] text-gray-400">Vergi No: {p.vat}</div>
                </td>
                <td className="px-5 py-3 text-xs text-gray-500 tabular-nums">{p.id}</td>
                <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-5 py-3 text-right"><Money value={p.amount} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
window.Dashboard = Dashboard;
