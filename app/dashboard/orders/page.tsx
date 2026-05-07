export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

// Sipariş Operasyonları is not yet implemented — redirect to stocks
export default function OrdersPage() {
  redirect('/dashboard/stocks')
}
