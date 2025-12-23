/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  images: {
    domains: [],
  },
  // Enable Turbopack with default settings (Next.js 16+)
  // This silences the error about using a webpack config without a turbopack config.
  turbopack: {},
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

