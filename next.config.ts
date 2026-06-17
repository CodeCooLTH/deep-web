import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['deepth.local', 'seller.deepth.local', 'admin.deepth.local'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
      // FB profile picture endpoint (avatar ใหญ่ ~200px จาก graph; 302 → fbcdn)
      { protocol: 'https', hostname: 'graph.facebook.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      // DEV/TEST เท่านั้น — รูปสินค้า seed ทดสอบจาก picsum; ถอดออกเมื่อต่อ upload จริง (supabase/r2/s3)
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
  outputFileTracingExcludes: {
    '*': [
      'theme/**',
      'docs/**',
      'uploads/**',
    ],
  },
}

export default nextConfig
