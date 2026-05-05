/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Treat missing Supabase env vars as a hard build failure
  // so CI catches it before deployment.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:      process.env.NEXT_PUBLIC_SUPABASE_URL      ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/**' },
    ],
  },

  // Silence noisy but harmless warnings from Supabase's realtime dependency
  // and jsPDF's optional canvas peer.
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false }
    return config
  },
}

module.exports = nextConfig
