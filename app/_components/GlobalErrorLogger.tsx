'use client'

// ─────────────────────────────────────────────────────────────────────────────
// GlobalErrorLogger
//
// Registers two browser-level error listeners so ALL unhandled JavaScript
// errors and unhandled promise rejections are written to the console with
// full stack traces.
//
// Why:
//   Vercel captures console.error() output in Function Logs. Without these
//   listeners, client-side crashes that happen outside of React's error
//   boundary (e.g. in lazy-loaded chunks, third-party scripts, async callbacks)
//   are invisible in production logs.
//
// Mounting: rendered once in RootLayout — the null return means zero DOM cost.
// Lifecycle: listeners are added on mount and cleaned up on unmount (HMR safe).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'

export default function GlobalErrorLogger() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      console.error('[Flowra][GlobalError] Unhandled JavaScript error:', {
        message:  event.message,
        filename: event.filename,
        line:     event.lineno,
        col:      event.colno,
        stack:    event.error?.stack ?? '(no stack)',
      })
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      console.error('[Flowra][UnhandledRejection] Unhandled promise rejection:', {
        message: reason instanceof Error ? reason.message : String(reason),
        stack:   reason instanceof Error ? reason.stack   : '(no stack)',
        reason,
      })
    }

    window.addEventListener('error',               handleError)
    window.addEventListener('unhandledrejection',  handleUnhandledRejection)

    return () => {
      window.removeEventListener('error',              handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Renders nothing — pure side-effect component.
  return null
}
