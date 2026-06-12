// Route-level loading skeleton for the data-fetching hubs. Next renders this
// INSTANTLY on navigation (while the hub's server component resolves auth + data),
// so the user gets immediate feedback instead of the previous screen freezing.
// Mirrors the hub shell shape: eyebrow + title hero, a tab row, and a content grid.
// Uses the app's `.fl-shimmer` (reduced-motion safe).

export default function HubSkeleton() {
  return (
    <div className="flex flex-col gap-5 w-full" aria-busy="true" aria-label="Yükleniyor">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="fl-shimmer rounded h-2.5 w-28" />
        <div className="fl-shimmer rounded-lg h-7 w-52" />
        <div className="fl-shimmer rounded h-3 w-72" />
      </div>

      {/* Tab row */}
      <div className="flex items-center gap-2">
        {[64, 72, 56, 60, 68].map((w, i) => (
          <div key={i} className="fl-shimmer rounded-md h-7" style={{ width: w }} />
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="fl-shimmer rounded-lg h-16" />
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="fl-shimmer rounded-lg h-56 lg:col-span-2" />
        <div className="fl-shimmer rounded-lg h-56" />
      </div>
    </div>
  )
}
