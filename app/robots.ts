import type { MetadataRoute } from 'next'

// Flowra is an authenticated app, not a marketing site — keep crawlers out of the
// app surface and (especially) the customer-facing document paths that carry pricing
// and financial statements. Complements the per-page robots:noindex on those pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: ['/dashboard/', '/api/', '/public/', '/documents/'],
    },
  }
}
