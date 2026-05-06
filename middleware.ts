// ── Flowra Middleware ──────────────────────────────────────────────────────────
// Edge-compatible: ONLY Supabase SSR session refresh + route protection.
// Rate limiting has been moved to individual API route handlers.
// This file must import NOTHING except @supabase/ssr and next/server.

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── ENV validation — checked once at cold-start ───────────────────────────────
// Using module-level constants so the missing-env error appears in cold-start
// logs (not buried inside a request) and avoids passing undefined to
// createServerClient(), which would produce a broken client with no error.
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ENV_OK            = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

if (!ENV_OK) {
  console.error(
    '[Flowra][middleware] FATAL: Supabase environment variables are missing.\n' +
    'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.\n' +
    'All authenticated requests will fail until these are configured.'
  )
}

// ── Request ID header ─────────────────────────────────────────────────────────
// Stamped on every request for distributed tracing.
// API routes read this via req.headers.get(REQUEST_ID_HEADER).
export const REQUEST_ID_HEADER = 'x-flowra-request-id'

function generateRequestId(): string {
  // crypto.randomUUID() is available on Edge runtime
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older runtimes
  const hex = () => Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`
}

export async function middleware(request: NextRequest) {
  // ── Global try/catch — middleware must NEVER throw ───────────────────────
  // An uncaught error in middleware blocks ALL requests. We catch everything
  // and fall through to NextResponse.next() so pages still load, then the
  // route-level auth checks handle unauthorised access.
  try {
    return await _middlewareInner(request)
  } catch (err) {
    console.error('[Flowra][middleware] Unhandled error — falling through:', err)
    return NextResponse.next()
  }
}

async function _middlewareInner(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // ── 1. Request ID ─────────────────────────────────────────────────────────
  const existingId = request.headers.get(REQUEST_ID_HEADER)
  const requestId  = (existingId && /^[0-9a-f-]{36}$/i.test(existingId))
    ? existingId
    : generateRequestId()

  // ── 2. Create response first — Supabase setAll() writes cookies onto it ───
  // We forward the request ID header so server components and route handlers
  // can read it via next/headers without us needing to mutate request.headers.
  const response = NextResponse.next({
    request: {
      headers: (() => {
        const h = new Headers(request.headers)
        h.set(REQUEST_ID_HEADER, requestId)
        return h
      })(),
    },
  })

  // ── 3. Supabase session refresh ───────────────────────────────────────────
  // Reads cookies from the incoming request.
  // Writes any refreshed tokens ONLY onto response.cookies — never onto request headers.
  //
  // If ENV vars are missing, skip session refresh — the request proceeds as
  // unauthenticated. Route-level auth checks will then reject protected requests
  // with a proper 401 rather than crashing the entire Edge worker.
  if (!ENV_OK) {
    const isDash = pathname.startsWith('/dashboard')
    const isApi  = pathname.startsWith('/api/')
    const isPub  = pathname.startsWith('/api/health') || pathname.startsWith('/api/fx')
    if (isDash) return NextResponse.redirect(new URL('/auth', request.url))
    if (isApi && !isPub) {
      return NextResponse.json(
        { error: 'Service unavailable — ENV not configured', code: 'ENV_MISSING' },
        { status: 503, headers: { [REQUEST_ID_HEADER]: requestId } }
      )
    }
    return response
  }

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Triggers token refresh if access token is expired.
  const { data: { user } } = await supabase.auth.getUser()

  // ── 4. Route protection ───────────────────────────────────────────────────
  const isDashboard = pathname.startsWith('/dashboard')
  const isAuthPage  = pathname.startsWith('/auth')
  const isApiRoute  = pathname.startsWith('/api/')
  // Public API routes — no auth required
  const isFxApi     = pathname.startsWith('/api/fx-rates') || pathname.startsWith('/api/fx')
  const isHealthApi = pathname.startsWith('/api/health')
  const isPublicApi = isFxApi || isHealthApi

  if (isDashboard && !user) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  if (isApiRoute && !isPublicApi && !user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } }
    )
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── 5. Security + tracing headers ────────────────────────────────────────
  response.headers.set(REQUEST_ID_HEADER,        requestId)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options',        'DENY')
  response.headers.set('Referrer-Policy',        'strict-origin-when-cross-origin')

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*', '/api/:path*', '/public/:path*'],
}
