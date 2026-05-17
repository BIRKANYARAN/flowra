import { redirect } from 'next/navigation'
export const dynamic = 'force-dynamic'
// Insights absorbed into Finance hub Risk tab and CEO cockpit AI panel.
export default function InsightsRedirect() { redirect('/dashboard/finance?tab=risks') }
