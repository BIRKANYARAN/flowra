import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Canonical route is now /dashboard/commercial?tab=proformas
export default function RedirectPage() {
  redirect('/dashboard/commercial?tab=proformas')
}
