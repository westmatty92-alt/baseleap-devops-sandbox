import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Security headers (SECURITY_MODEL invariant 14) are set by devops/backend; not part of the scaffold.
};

export default nextConfig;
