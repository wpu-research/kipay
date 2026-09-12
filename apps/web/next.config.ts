import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@panel/types'],
  allowedDevOrigins: ['192.168.0.111'],
}

export default nextConfig
