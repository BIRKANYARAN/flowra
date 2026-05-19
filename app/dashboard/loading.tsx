// Dashboard loading skeleton — shown by Next.js App Router while server
// components are fetching data. Prevents blank white screen on navigation.

export default function DashboardLoading() {
  return (
    <div className="max-w-5xl space-y-5 animate-pulse">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="h-7 w-48 bg-gray-100 rounded mb-2" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-28 bg-gray-100 rounded" />
      </div>

      {/* KPI strip skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded p-4 space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-6 w-28 bg-gray-100 rounded" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="bg-white border border-gray-100 rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="h-3 w-32 bg-gray-100 rounded" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 px-5 py-3.5 border-b border-gray-50 last:border-0 gap-4">
            <div className="col-span-4 h-4 bg-gray-100 rounded" />
            <div className="col-span-3 h-4 bg-gray-100 rounded" />
            <div className="col-span-2 h-4 bg-gray-100 rounded" />
            <div className="col-span-3 h-4 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
