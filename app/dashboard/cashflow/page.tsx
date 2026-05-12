// /dashboard/cashflow → redirected to Financial Intelligence Hub (cashflow tab)
// FAZ T2: cashflow page merged into /dashboard/finance?tab=cashflow
import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default function CashflowPage() {
  redirect('/dashboard/finance?tab=cashflow')
}
