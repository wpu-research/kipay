import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@panel/types'],
  allowedDevOrigins: ['192.168.0.111'],
  async rewrites() {
    return [
      // Ödeme sayfası — public/odeme.html'i /odeme altında servis eder.
      { source: '/odeme',      destination: '/odeme.html' },
      { source: '/odeme/',     destination: '/odeme.html' },
    ]
  },
}

export default nextConfig
