import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
// Alerts are surfaced in the CEO cockpit via AlertEngine. Standalone page retired.
export default function AlertsRedirect() { redirect('/dashboard') }
