import { redirect } from 'next/navigation'

// /dashboard/orders → canonical location is operations hub orders tab
export default function OrdersPage() {
  redirect('/dashboard/operations?tab=orders')
}
