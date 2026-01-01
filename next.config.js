const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PART 1: Enable source maps for production debugging
  productionBrowserSourceMaps: true,
  
  // App Router is default in Next.js 13+ (using src/app directory)
  // No pages directory exists, so no _document.js should be generated
  
  // Exclude script files from build (they're standalone scripts, not part of the app)
  webpack: (config, { isServer }) => {
    // Configure path aliases for webpack
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
    }
    
    if (!isServer) {
      // Client-side: prevent Buffer polyfill
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: false,
      }
    }
    
    // Exclude scripts and tests directories from webpack processing
    config.externals = config.externals || []
    if (typeof config.externals === 'function') {
      const originalExternals = config.externals
      config.externals = [
        (ctx, callback) => {
          if (ctx.request && (ctx.request.includes('/src/scripts/') || ctx.request.includes('/tests/'))) {
            return callback()
          }
          return originalExternals(ctx, callback)
        },
      ]
    }
    
    return config
  },
  
  // Exclude scripts from TypeScript compilation in build
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // Disable ESLint during build to avoid config conflicts
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
