// /dashboard/activity — legacy route, redirects to the full audit log
// The advanced audit page at /dashboard/admin/audit supersedes this view.
import { redirect } from 'next/navigation'

export default function ActivityPage() {
  redirect('/dashboard/admin/audit')
}
