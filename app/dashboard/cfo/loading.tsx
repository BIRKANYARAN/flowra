// Instant nav skeleton for the Muhasebe GL tool pages (/dashboard/cfo/*: mizan,
// yevmiye, dönem kapanış, mutabakat, KDV/kurumlar). Several fetch data in their
// server component with no Suspense, so without this the previous screen froze on
// navigation. GL tools are tables/forms → a header + content block (no KPI strip).
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 w-full" aria-busy="true" aria-label="Yükleniyor">
      <div className="flex flex-col gap-2">
        <div className="fl-shimmer rounded h-2.5 w-24" />
        <div className="fl-shimmer rounded-lg h-7 w-56" />
        <div className="fl-shimmer rounded h-3 w-80" />
      </div>
      <div className="fl-shimmer rounded-lg h-72" />
    </div>
  )
}
