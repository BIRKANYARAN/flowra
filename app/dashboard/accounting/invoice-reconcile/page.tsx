// ── /dashboard/accounting/invoice-reconcile — invoices ↔ Flowra sales preview ─
// Read-only reconciliation (no persistence, no DDL).

import InvoiceReconcileClient from './InvoiceReconcileClient'

export const metadata = { title: 'Fatura Mutabakatı (Önizleme)' }

export default function InvoiceReconcilePage() {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Entegrasyonlar</div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">Fatura Mutabakatı</h1>
        <p className="text-sm text-[#94a3b8] mt-1 max-w-2xl">
          Muhasebe/e-Fatura sisteminizin fatura listesini yükleyin; Flowra satışlarıyla eşleştirip
          <strong className="text-[#475569]"> muhasebede görünüp Flowra’da olmayan</strong> faturaları çıkarır. Önizleme —
          hiçbir şey kaydedilmez.
        </p>
      </div>
      <InvoiceReconcileClient />
    </div>
  )
}
