import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// OPS Komuta is now the first tab of the Operations hub.
// Canonical route: /dashboard/operations?tab=komuta
export default function OpsRedirectPage() {
  redirect('/dashboard/operations?tab=komuta')
}
