// /dashboard/analytics → redirected to Financial Intelligence Hub (quarterly tab)
// FAZ T2: analytics merged into /dashboard/finance?tab=quarterly
import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default function AnalyticsPage() {
  redirect('/dashboard/finance?tab=quarterly')
}
