import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Canonical route is now /dashboard/operations?tab=expenses
export default function RedirectPage() {
  redirect('/dashboard/operations?tab=expenses')
}
