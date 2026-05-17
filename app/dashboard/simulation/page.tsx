import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Canonical route is now /dashboard/planning?tab=unit-profit
export default function RedirectPage() {
  redirect('/dashboard/planning?tab=unit-profit')
}
