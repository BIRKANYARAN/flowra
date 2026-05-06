'use client'

// ─────────────────────────────────────────────────────────────────────────────
// app/error.tsx — Root page error boundary
//
// Catches errors thrown by app/page.tsx (the root redirect page) and renders
// a user-visible fallback with a retry button rather than a blank screen.
//
// Hierarchy:
//   global-error.tsx   — catches errors in the root layout itself (html/body)
//   app/error.tsx      — catches errors in app/page.tsx (this file)
//   dashboard/error.tsx — catches errors inside the /dashboard segment
//
// Note: Rendered inside the root layout, so Tailwind and globals.css are
// available — but we use inline styles here so it works even if CSS fails to
// load (e.g. during a partial build failure).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Write to console so this appears in Vercel Function Logs
    console.error('[Flowra][RootError] Unhandled error in root page:', {
      message: error.message,
      digest:  error.digest,
      stack:   error.stack,
    })
  }, [error])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f9fafb',
    }}>
      <div style={{
        backgroundColor: '#ffffff', border: '1px solid #e5e7eb',
        borderRadius: '16px', padding: '48px 40px', maxWidth: '440px',
        width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>

        <h2 style={{
          fontSize: '18px', fontWeight: 700, color: '#111827',
          marginBottom: '8px', margin: '0 0 8px 0',
        }}>
          Bir hata oluştu
        </h2>

        <p style={{
          fontSize: '14px', color: '#6b7280',
          marginBottom: '24px', lineHeight: '1.5',
        }}>
          Sayfa yüklenirken beklenmeyen bir hata meydana geldi.
          Lütfen tekrar deneyin.
        </p>

        {/* Show digest (not message) in production — safe to display */}
        {error?.digest && (
          <p style={{
            fontSize: '11px', color: '#9ca3af', marginBottom: '20px',
            fontFamily: 'monospace',
          }}>
            Hata kodu: {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          style={{
            backgroundColor: '#4f46e5', color: '#ffffff', border: 'none',
            padding: '10px 28px', borderRadius: '12px', fontSize: '14px',
            fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseOver={e => { (e.target as HTMLButtonElement).style.backgroundColor = '#4338ca' }}
          onMouseOut={e =>  { (e.target as HTMLButtonElement).style.backgroundColor = '#4f46e5' }}
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
