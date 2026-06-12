// Server layout — browser-tab title for the Muhasebe GL tool pages (/dashboard/cfo/*:
// mizan, yevmiye, dönem kapanış, mutabakat, KDV/kurumlar). They're mostly client
// components that can't export metadata, so this segment layout gives them all
// "Muhasebe · Flowra" instead of the generic default.
import type { ReactNode } from 'react'

export const metadata = { title: 'Muhasebe' }

export default function CfoLayout({ children }: { children: ReactNode }) {
  return children
}
