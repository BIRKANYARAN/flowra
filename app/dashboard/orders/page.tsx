export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

// /dashboard/orders has been removed. Redirect to the correct destination.
export default function OrdersPage() {
  redirect('/dashboard/stocks')
}
