/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Next 14.2 reuses a dynamic page's client render for 30s on back-navigation,
    // so reopening a ticket (open → dashboard → reopen) served the STALE first
    // render — the server never re-ran, so per-visit state like the RM "new vs seen
    // supplier updates" watermark never re-evaluated. 0 = always refetch fresh on
    // navigation, which suits this force-dynamic + realtime app.
    staleTimes: { dynamic: 0 },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
