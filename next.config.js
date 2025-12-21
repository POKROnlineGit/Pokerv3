/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  images: {
    domains: [],
  },
  // Webpack config for path aliases (required for @backend imports)
  webpack: (config, { isServer }) => {
    // Add alias for @backend to resolve shared-backend imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@backend': path.resolve(__dirname, 'shared-backend/src'),
    };
    return config;
  },
}

module.exports = nextConfig

