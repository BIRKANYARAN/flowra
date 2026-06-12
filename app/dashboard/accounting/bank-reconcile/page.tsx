// ── /dashboard/accounting/bank-reconcile — statement ↔ book preview ───────────
// Read-only reconciliation preview (no persistence, no DDL). Roadmap step 3 made
// usable before a real bank connector exists.

import BankReconcileClient from './BankReconcileClient'

export const metadata = { title: 'Banka Mutabakatı (Önizleme)' }

export default function BankReconcilePage() {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Entegrasyonlar</div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">Banka Ekstresi Mutabakatı</h1>
        <p className="text-sm text-[#94a3b8] mt-1 max-w-2xl">
          Banka ekstrenizi yükleyin; Flowra’daki tahsilat ve ödeme kayıtlarıyla otomatik eşleştirip
          <strong className="text-[#475569]"> bankada görünüp Flowra’da olmayan</strong> hareketleri çıkarır. Önizleme —
          hiçbir şey kaydedilmez.
        </p>
      </div>
      <BankReconcileClient />
    </div>
  )
}
