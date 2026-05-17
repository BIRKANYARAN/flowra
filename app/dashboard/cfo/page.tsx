import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Canonical route is now /dashboard/finance?tab=cfo
export default function RedirectPage() {
  redirect('/dashboard/finance?tab=cfo')
}
