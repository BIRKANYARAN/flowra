// /dashboard/tax → redirected to Financial Intelligence Hub (tax tab)
// FAZ T2: tax page merged into /dashboard/finance?tab=tax
import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default function TaxPage() {
  redirect('/dashboard/finance?tab=tax')
}
