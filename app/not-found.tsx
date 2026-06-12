// app/not-found.tsx — branded 404 for any unmatched route or notFound() call.
// Without this, Next serves its stark English default ("404 | This page could not
// be found.") — off-brand for a Turkish SME product. Server component; inline
// styles so it renders even if globals.css fails to load (mirrors app/error.tsx).

export const metadata = { title: 'Sayfa bulunamadı' }

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f9fafb', padding: '16px',
    }}>
      <div style={{
        backgroundColor: '#ffffff', border: '1px solid #e5e7eb',
        borderRadius: '16px', padding: '48px 40px', maxWidth: '440px',
        width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          fontSize: '34px', fontWeight: 800, color: '#5b21b6',
          letterSpacing: '0.04em', marginBottom: '4px',
        }}>
          404
        </div>

        <h2 style={{
          fontSize: '18px', fontWeight: 700, color: '#111827',
          margin: '0 0 8px 0',
        }}>
          Sayfa bulunamadı
        </h2>

        <p style={{
          fontSize: '14px', color: '#6b7280',
          marginBottom: '24px', lineHeight: '1.5',
        }}>
          Aradığınız sayfa taşınmış, silinmiş ya da bağlantı geçersiz olabilir.
        </p>

        <a
          href="/dashboard"
          style={{
            display: 'inline-block', backgroundColor: '#5b21b6', color: '#ffffff',
            textDecoration: 'none', padding: '10px 28px', borderRadius: '12px',
            fontSize: '14px', fontWeight: 600,
          }}
        >
          Kokpit'e dön
        </a>
      </div>
    </div>
  )
}
