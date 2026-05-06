'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Bir hata oluştu</h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              Uygulama yüklenirken beklenmeyen bir hata meydana geldi.
            </p>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#4f46e5', color: 'white', border: 'none',
                padding: '10px 20px', borderRadius: '12px', fontSize: '14px',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
