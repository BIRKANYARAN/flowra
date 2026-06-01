// ── Storage service — secure file upload with magic bytes validation ──────────
//
// V3 requirements:
//   • Validate MIME type AND magic bytes (not just client-declared type)
//   • Max 2MB
//   • UUID-based filenames (no path traversal)
//   • Public bucket — permanent public URLs (no signed-URL expiry problem)

import { createClient } from '@/lib/supabase-server'

// Allowed image types and their magic byte signatures
const ALLOWED_TYPES: Record<string, { mime: string; magic: number[] }[]> = {
  image: [
    { mime: 'image/png',  magic: [0x89, 0x50, 0x4E, 0x47] },          // PNG: \x89PNG
    { mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },                 // JPEG: \xFF\xD8\xFF
    { mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] },           // WEBP: RIFF
    { mime: 'image/gif',  magic: [0x47, 0x49, 0x46, 0x38] },           // GIF: GIF8
    // SVG has no magic bytes — detected by MIME only (safe, it's text)
    { mime: 'image/svg+xml', magic: [] },
  ],
}

const MAX_BYTES = 2 * 1024 * 1024   // 2 MB

export interface UploadResult {
  path:      string
  publicUrl: string
}

export class StorageError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'StorageError'
  }
}

/**
 * Validate file bytes against magic bytes for common image formats.
 * Returns the detected MIME type or throws StorageError.
 */
export function validateImageBytes(buffer: ArrayBuffer, declaredMime: string): void {
  if (buffer.byteLength > MAX_BYTES) {
    throw new StorageError(`Dosya boyutu ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB'ı aşamaz`, 'FILE_TOO_LARGE')
  }

  const bytes = new Uint8Array(buffer.slice(0, 12))

  // SVG is text/XML. It is stored in a PUBLIC bucket and served as
  // image/svg+xml, so a malicious SVG with embedded <script>, event handlers, or
  // javascript: URLs executes as STORED XSS when opened directly. Validate the
  // structure AND reject anything scriptable (sanitize-by-rejection).
  if (declaredMime === 'image/svg+xml') {
    const text = new TextDecoder().decode(buffer)
    const stripped = text.trimStart().replace(/^<\?xml[^>]*>/, '').trimStart()
    if (!stripped.startsWith('<svg') && !stripped.startsWith('<!DOCTYPE svg')) {
      throw new StorageError('Geçersiz SVG dosyası', 'INVALID_SVG')
    }
    const lower = text.toLowerCase()
    const DANGEROUS: RegExp[] = [
      /<script[\s>]/,                                   // <script>
      /<foreignobject[\s>]/,                            // embeds arbitrary HTML
      /<!entity/,                                       // XXE / entity expansion
      /\son\w+\s*=/,                                    // onload= onerror= onclick= ...
      /(?:href|xlink:href)\s*=\s*["']?\s*javascript:/,  // javascript: links
      /url\(\s*["']?\s*javascript:/,                    // javascript: in url()
      /<(?:iframe|embed|object|audio|video|set|animate)[\s>]/, // active/scriptable elements
    ]
    if (DANGEROUS.some(re => re.test(lower))) {
      throw new StorageError(
        'SVG dosyası güvenlik nedeniyle reddedildi (betik veya olay işleyici içeriyor).',
        'UNSAFE_SVG',
      )
    }
    return
  }

  const allowed = ALLOWED_TYPES.image.filter(t => t.magic.length > 0)
  let matched = false

  for (const type of allowed) {
    if (type.magic.every((b, i) => bytes[i] === b)) {
      matched = true
      break
    }
  }

  if (!matched) {
    throw new StorageError(
      'Dosya türü desteklenmiyor. Yalnızca PNG, JPEG, WebP, GIF ve SVG yükleyebilirsiniz.',
      'INVALID_FILE_TYPE'
    )
  }
}

/**
 * Upload a logo file with full security validation.
 * Returns the stored path and the permanent public URL.
 * Requires: logos bucket exists and is PUBLIC (see supabase/install.sql storage section).
 */
export async function uploadLogo(
  userId:   string,
  buffer:   ArrayBuffer,
  mimeType: string
): Promise<UploadResult> {
  // 1. Validate
  validateImageBytes(buffer, mimeType)

  // 2. Fixed path per user — always logo.png so upsert always hits the same
  //    object regardless of source format.  Content-Type is set explicitly in
  //    the upload options, so the file is served with the correct MIME type.
  //    Path within the 'logos' bucket: {userId}/logo.png
  const path = `${userId}/logo.png`

  const supabase = createClient()

  // 3. Upload (upsert — replaces previous logo at same path)
  //    contentType  → sets the HTTP Content-Type header Supabase returns when serving the object
  //    metadata     → persists the true MIME as a custom attribute; useful if a CDN or proxy
  //                   overrides Content-Type from the file extension (.png) instead of the header
  const { error: upErr } = await supabase.storage
    .from('logos')
    .upload(path, buffer, {
      upsert:       true,
      contentType:  mimeType,
      cacheControl: '3600',
      metadata:     { contentType: mimeType },
    })

  if (upErr) throw new StorageError('Yükleme hatası: ' + upErr.message, 'UPLOAD_FAILED')

  // 4. Public URL — permanent, no expiry (bucket must be public)
  const { data: pub } = supabase.storage.from('logos').getPublicUrl(path)

  return { path, publicUrl: pub.publicUrl }
}

/**
 * Resolve a logo reference to its public URL.
 *
 * Accepts either:
 *   a) A full https:// URL (new-style — returned as-is)
 *   b) A bare storage path like "userId/logo.png" (legacy — derives public URL)
 *
 * Returns null when the input is empty or the URL cannot be derived.
 */
export function getLogoPublicUrl(pathOrUrl: string): string | null {
  if (!pathOrUrl?.trim()) return null
  // Already a full URL — return directly
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  // Legacy storage path — construct the public URL
  try {
    const supabase = createClient()
    const { data } = supabase.storage.from('logos').getPublicUrl(pathOrUrl)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}

/**
 * @deprecated Use getLogoPublicUrl — logos are now served from a public bucket.
 * Kept for any callers that haven't been updated yet; wraps getLogoPublicUrl.
 */
export async function getLogoSignedUrl(pathOrUrl: string, _expiresInSeconds = 3600): Promise<string | null> {
  return getLogoPublicUrl(pathOrUrl)
}
