'use client'
// ─────────────────────────────────────────────────────────────────────────────
// lib/query-provider.tsx — TanStack Query global provider
//
// Wraps the dashboard tree with QueryClientProvider so any client component
// can use useQuery / useMutation without per-component setup.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const QUERY_DEFAULTS = {
  queries: {
    staleTime:   60 * 1000,     // 1 min — avoids refetch on every focus
    gcTime:      5 * 60 * 1000, // 5 min — cache survives tab switches
    retry:       1,
    refetchOnWindowFocus: false,
  },
} as const

export function QueryProvider({ children }: { children: ReactNode }) {
  // Stable client instance per mount (avoids Next.js hydration mismatches)
  const [client] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
