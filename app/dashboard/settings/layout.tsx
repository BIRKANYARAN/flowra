// Server layout — sets the browser-tab title for the (client) Ayarlar hub.
import type { ReactNode } from 'react'

export const metadata = { title: 'Ayarlar' }

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children
}
