// ── /dashboard/accounting/cari-reconcile — cari ↔ Flowra customers preview ────
// Read-only name reconciliation (no persistence, no DDL).

import CariReconcileClient from './CariReconcileClient'

export const metadata = { title: 'Cari Mutabakatı (Önizleme)' }

export default function CariReconcilePage() {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Entegrasyonlar</div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">Cari Mutabakatı</h1>
        <p className="text-sm text-[#94a3b8] mt-1 max-w-2xl">
          Muhasebe sisteminizin cari (müşteri/tedarikçi) listesini yükleyin; Flowra müşterileriyle isim bazında
          eşleştirip <strong className="text-[#475569]">muhasebede olup Flowra’da olmayan</strong> carileri çıkarır.
          Önizleme — hiçbir şey kaydedilmez.
        </p>
      </div>
      <CariReconcileClient />
    </div>
  )
}
