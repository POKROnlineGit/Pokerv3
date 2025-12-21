/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  webpack: (config, { isServer }) => {
    // Add alias for @backend to resolve shared-backend imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@backend': require('path').resolve(__dirname, 'shared-backend/src'),
    };
    return config;
  },
}

module.exports = nextConfig

