/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  images: {
    domains: [],
  },
  // Enable Turbopack with default settings (Next.js 16+)
  // This silences the error about using a webpack config without a turbopack config.
  turbopack: {},
  // Webpack config for path aliases (required for @backend and @app imports)
  webpack: (config, { isServer }) => {
    // Add alias for @backend to resolve shared-backend imports
    // Add alias for @app to resolve app directory imports (with wildcard support)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@backend': path.resolve(__dirname, 'src/shared/backend/src'),
    };
    
    // Handle @app/* pattern by adding to modules array
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(__dirname, 'app'),
    ];
    
    // Also add direct alias for @app root
    config.resolve.alias['@app'] = path.resolve(__dirname, 'app');
    
    return config;
  },
}

module.exports = nextConfig
