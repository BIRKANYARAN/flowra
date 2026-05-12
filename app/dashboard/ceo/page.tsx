// /dashboard/ceo → redirected to Financial Intelligence Hub (overview tab)
// FAZ T2: CEO dashboard merged into /dashboard/finance?tab=overview
import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default function CeoDashboardPage() {
  redirect('/dashboard/finance?tab=overview')
}
