'use client'
// ── DocActionBar — screen-only action toolbar for document pages ───────────────
// Client component needed for onClick handlers (print, clipboard).

interface Props {
  backHref:  string
  backLabel: string
}

export function DocActionBar({ backHref, backLabel }: Props) {
  function handlePrint() {
    window.print()
  }

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => undefined)
    }
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'sticky', top: 0, zIndex: 50, background: '#fff',
        borderBottom: '1px solid #e2e8f0', padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <a
        href={backHref}
        style={{ fontSize: 12, color: '#64748b', textDecoration: 'none', marginRight: 'auto' }}
      >
        ← {backLabel}
      </a>
      <button
        onClick={handlePrint}
        style={{
          padding: '7px 16px', background: '#0f172a', color: '#fff',
          border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Yazdır
      </button>
      <button
        onClick={handlePrint}
        style={{
          padding: '7px 16px', background: '#f8fafc', color: '#334155',
          border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        PDF İndir
      </button>
      <button
        onClick={handleCopy}
        style={{
          padding: '7px 16px', background: '#f8fafc', color: '#334155',
          border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Bağlantı Kopyala
      </button>
    </div>
  )
}
