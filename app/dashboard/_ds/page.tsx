/**
 * Design System Showcase — dev-only route at /dashboard/_ds
 * Not linked from navigation. Blocked in production.
 *
 * Server component: calls notFound() in production so the page is truly
 * inaccessible (returns 404). The client content only renders in development.
 */
import { notFound } from 'next/navigation'
import DesignSystemContent from './_ds-content'

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  return <DesignSystemContent />
}
