import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
// Backups moved to admin area.
export default function BackupsRedirect() { redirect('/dashboard/admin') }
