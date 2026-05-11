export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

// Activity log has been consolidated into the full audit system.
export default function ActivityPage() {
  redirect('/dashboard/admin/audit')
}
