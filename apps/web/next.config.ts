import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@saas/types'],
};

export default nextConfig;
