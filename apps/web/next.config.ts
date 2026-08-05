import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@bop-agency/ui',
    '@bop-agency/shared',
    '@bop-agency/domain',
    '@bop-agency/application',
    '@bop-agency/infrastructure',
    '@bop-agency/automation-engine',
  ],
};

export default nextConfig;
