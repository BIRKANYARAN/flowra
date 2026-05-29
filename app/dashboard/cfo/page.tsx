import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Canonical route is now /dashboard/finance?tab=cfo
// Period-close workflow is at /dashboard/cfo/period-close (PeriodCloseTab)
export default function RedirectPage() {
  redirect('/dashboard/finance?tab=cfo')
}
