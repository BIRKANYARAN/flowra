// lib/api-utils.ts
//
// Lightweight API route utilities for consistent error responses and observability.
//
// Problem: when DB is temporarily unavailable or a service throws,
// routes that don't propagate REQUEST_ID_HEADER on 500 responses leave support
// with no correlation ID to find the matching log entry. Financial routes are
// especially critical because CFO and CEO decisions depend on them.
//
// Usage pattern (recommended for every financial route):
//
//   const ctx = reqCtx(req)            // always available, even if auth fails
//   try {
//     const auth = await resolveApiAuth(req)
//     if (!auth.ok) return auth.response
//     // ... handler logic
//   } catch (e) {
//     console.error('[route-name]', e)
//     return apiError(ctx, 'Bilanço hesaplanamadı', 500)
//   }

import { NextRequest, NextResponse } from 'next/server'
import { contextFromHeader, type RequestContext } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'

export type ApiErrorType = 'BUSINESS' | 'SYSTEM' | 'SECURITY'

/**
 * Resolve a RequestContext from the incoming request's X-Request-ID header.
 * Always succeeds — generates a fresh ID if the header is absent.
 * Call this at the TOP of every route handler so catch blocks always have it.
 */
export function reqCtx(req: NextRequest): RequestContext {
  return contextFromHeader(req.headers.get(REQUEST_ID_HEADER))
}

/**
 * Create a structured, traceable JSON error response.
 *
 * Always includes X-Request-ID when ctx is provided — allows support to
 * correlate a client-reported error with the corresponding system_logs entry.
 *
 * @param ctx       RequestContext from reqCtx(req) — pass null only if unavailable
 * @param message   Human-readable error message (Turkish for user-facing routes)
 * @param status    HTTP status code (default: 500)
 * @param code      Machine-readable error code (default: 'SYSTEM_ERROR')
 * @param type      Error category (default: 'SYSTEM')
 */
export function apiError(
  ctx:     RequestContext | null,
  message: string,
  status = 500,
  code:    string = 'SYSTEM_ERROR',
  type:    ApiErrorType = 'SYSTEM',
): NextResponse {
  const headers: Record<string, string> = {}
  if (ctx?.requestId) headers[REQUEST_ID_HEADER] = ctx.requestId
  return NextResponse.json({ error: message, code, type }, { status, headers })
}
