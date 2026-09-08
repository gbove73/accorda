import type { NextConfig } from 'next';

const isStaticContaboBuild = process.env.ACCORDA_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = isStaticContaboBuild
  ? {
      assetPrefix: '/accorda',
      output: 'export',
      trailingSlash: true,
    }
  : {};

export default nextConfig;
