import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import GlobalErrorLogger from './_components/GlobalErrorLogger'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],   // latin-ext covers Turkish glyphs (ş/ğ/İ/ı)
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  // `default` shows on routes with no own title; `template` makes every page that
  // sets a title render as "<Page> · Flowra" so browser tabs are distinguishable.
  title: { default: 'Flowra — ERP', template: '%s · Flowra' },
  description: 'Profesyonel proforma ve satış yönetim sistemi.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="font-sans antialiased">
        {/* Global browser error logger — captures all unhandled JS errors
            and unhandled promise rejections, writes them to console so they
            appear in Vercel Function Logs. Renders nothing in the DOM. */}
        <GlobalErrorLogger />
        {children}
      </body>
    </html>
  )
}
