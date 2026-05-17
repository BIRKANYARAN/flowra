// ── Flowra Middleware ──────────────────────────────────────────────────────────
// Edge-compatible: ONLY Supabase SSR session refresh + route protection.
// Rate limiting has been moved to individual API route handlers.
// This file must import NOTHING except @supabase/ssr and next/server.
//
// Route redirects: old flat routes → hub center routes (canonical URL map).
// Handled here so the 16 stub page files can be deleted entirely.

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

// ── Dashboard route redirect map ──────────────────────────────────────────────
// Old flat routes → new hub center URLs (301 Permanent Redirect).
// IMPORTANT: Only exact-match pathname → destination (no dynamic segments).
// Detail routes (/sales/[id], /customers/[id], etc.) are NOT listed here —
// they remain at their original paths.
const DASHBOARD_REDIRECTS: Record<string, string> = {
  '/dashboard/cashflow':    '/dashboard/finance?tab=cashflow',
  '/dashboard/tax':         '/dashboard/finance?tab=tax',
  '/dashboard/analytics':   '/dashboard/finance?tab=risks',
  '/dashboard/cfo':         '/dashboard/finance?tab=cfo',
  '/dashboard/sales-flow':  '/dashboard/commercial?tab=pipeline',
  '/dashboard/proformas':   '/dashboard/commercial?tab=proformas',
  '/dashboard/sales':       '/dashboard/commercial?tab=sales',
  '/dashboard/collections': '/dashboard/commercial?tab=collections',
  '/dashboard/customers':   '/dashboard/commercial?tab=customers',
  '/dashboard/expenses':    '/dashboard/operations?tab=expenses',
  '/dashboard/catalog':     '/dashboard/operations?tab=catalog',
  '/dashboard/products':    '/dashboard/operations?tab=catalog',
  '/dashboard/stocks':      '/dashboard/operations?tab=stock',
  '/dashboard/orders':      '/dashboard/operations?tab=orders',
  '/dashboard/simulation':  '/dashboard/planning?tab=unit-profit',
  '/dashboard/tasks':       '/dashboard/planning?tab=tasks',
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

  // ── 0. Canonical route redirects ──────────────────────────────────────────
  // Exact-match only — detail routes like /sales/[id] pass through unaffected.
  if (DASHBOARD_REDIRECTS[pathname]) {
    return NextResponse.redirect(
      new URL(DASHBOARD_REDIRECTS[pathname], request.url),
      { status: 301 },
    )
  }

  // ── 1. Request ID ─────────────────────────────────────────────────────────
  const existingId = request.headers.get(REQUEST_ID_HEADER)
  const requestId  = (existingId && /^[0-9a-f-]{36}$/i.test(existingId))
    ? existingId
    : generateRequestId()

  // ── 2. Build the initial forwarded response ────────────────────────────────
  // `response` is declared `let` so that setAll() can recreate it with updated
  // request cookies — the only way server components see refreshed tokens.
  const baseHeaders = new Headers(request.headers)
  baseHeaders.set(REQUEST_ID_HEADER, requestId)

  let response = NextResponse.next({ request: { headers: baseHeaders } })

  // ── 3. Supabase session refresh ───────────────────────────────────────────
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
        // CRITICAL: setAll must update BOTH request cookies (so server components
        // in this request cycle see the refreshed tokens via next/headers cookies())
        // AND the response cookies (so the browser stores the new tokens).
        // Without updating request.cookies and recreating `response` with the updated
        // request, server components call getUser() with the old expired token and
        // redirect to /auth even though the middleware successfully refreshed it —
        // causing an ERR_TOO_MANY_REDIRECTS loop.
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          // Step 1: Mutate the request cookie store
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Step 2: Rebuild the Cookie header from the NOW-MUTATED cookie store.
          //
          // CRITICAL: `request.headers` is immutable — `new Headers(request.headers)`
          // snapshots the ORIGINAL Cookie header and does NOT include the mutations
          // applied in Step 1 via request.cookies.set(). We must rebuild the Cookie
          // header explicitly from request.cookies.getAll() so that downstream server
          // components (layout, page) receive the refreshed access token.
          //
          // Without this, middleware refreshes the token, writes new cookies to the
          // response (browser receives them), but the CURRENT request's Cookie header
          // still carries the expired token → every server component's getUser() fails
          // → redirect('/auth') → middleware sees authenticated user → redirect('/dashboard')
          // → ERR_TOO_MANY_REDIRECTS.
          const updatedHeaders = new Headers(request.headers)
          updatedHeaders.set(
            'cookie',
            request.cookies.getAll().map(c => `${c.name}=${c.value}`).join('; '),
          )
          updatedHeaders.set(REQUEST_ID_HEADER, requestId)
          response = NextResponse.next({ request: { headers: updatedHeaders } })
          // Step 3: Write to response cookies so the browser stores the new tokens
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
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
  response.headers.set('Permissions-Policy',     'camera=(), microphone=(), geolocation=()')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  )
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js requires unsafe-eval in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://*.supabase.io wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*', '/api/:path*', '/public/:path*'],
}
