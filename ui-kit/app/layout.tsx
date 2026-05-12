import './globals.css'
import type { Metadata } from 'next'
import GlobalErrorLogger from './_components/GlobalErrorLogger'

export const metadata: Metadata = {
  title: 'Flowra — ERP',
  description: 'Profesyonel proforma ve satış yönetim sistemi.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {/* Global browser error logger — captures all unhandled JS errors
            and unhandled promise rejections, writes them to console so they
            appear in Vercel Function Logs. Renders nothing in the DOM. */}
        <GlobalErrorLogger />
        {children}
      </body>
    </html>
  )
}
