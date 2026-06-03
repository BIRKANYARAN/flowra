// Server-side logo → base64 data-URI resolver.
//
// The client jsPDF engine used to fetch the logo from Supabase storage in the
// browser and draw it onto a canvas. That fetch failed silently in production
// (cache-buster query → CDN/bot-challenge, CORS edge cases, timing), so the
// downloaded PDF showed the company name instead of the logo. Resolving the logo
// to a data: URI on the SERVER removes the browser fetch entirely: the PDF engine
// receives the bytes inline and embeds them directly — no network, no CORS, no
// canvas-taint. On any failure we fall back to the original URL so the client can
// still try.

const MAX_LOGO_BYTES = 3_000_000   // 3 MB sanity cap
const FETCH_TIMEOUT  = 4000

export async function resolveLogoDataUri(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl || !logoUrl.trim()) return null
  const url = logoUrl.trim()
  if (url.startsWith('data:')) return url            // already inline
  if (!/^https?:\/\//i.test(url)) return url         // not an absolute URL — leave as-is

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (!res.ok) return url

    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!ct.startsWith('image/')) return url          // a challenge/HTML page, not an image → fall back

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return url

    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return url
  }
}
