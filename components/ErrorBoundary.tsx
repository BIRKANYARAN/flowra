'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/ErrorBoundary.tsx — reusable client error boundary
//
// Wrap a client island/section so an uncaught render error degrades to a LOCAL
// fallback ("Bu bölüm yüklenemedi") instead of bubbling to the route-level
// error.tsx and blanking the whole page ("Sayfada bir hata oluştu"). The real
// error is logged to the console so it stays diagnosable.
// ─────────────────────────────────────────────────────────────────────────────

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional custom fallback UI. */
  fallback?: ReactNode
  /** Short label included in the console error, for diagnosis. */
  label?: string
}

interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `/${this.props.label}` : ''}]`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-6 text-center shadow-sm">
            <p className="text-xs text-[#94a3b8]">Bu bölüm yüklenemedi. Sayfayı yenileyin.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
