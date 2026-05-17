import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// CEO cockpit is now at /dashboard (the main Komuta Merkezi)
export default function RedirectPage() {
  redirect('/dashboard')
}
