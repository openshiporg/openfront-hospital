import type { NextConfig } from 'next';
import { s3ForcePathStyle } from './features/keystone/lib/s3-storage';

const s3Hostname = process.env.S3_ENDPOINT ? process.env.S3_ENDPOINT.replace(/^https?:\/\//, '').replace(/:\d+$/, '') : '/';

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['graphql'],
  // As E-commerce: core upload and document server actions send up to 10 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Workaround since we diverged from Keystone reltionship and document views
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  async headers() {
    return [
      {
        source: '/intake/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, private' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/dashboard/reset',
        headers: [
          { key: 'Cache-Control', value: 'no-store, private' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // Virtual-hosted buckets serve images from <bucket>.<endpoint host>
        hostname: s3ForcePathStyle(process.env.S3_ENDPOINT) ? s3Hostname : `${process.env.S3_BUCKET_NAME}.${s3Hostname}`,
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;