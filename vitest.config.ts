import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts', 
      'src/**/__tests__/**/*.ts',
      'tests/**/*.test.ts', // Include tests directory
    ],
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000,
    setupFiles: ['./tests/setup.ts'], // Test setup file
    // Run DB tests serially to avoid conflicts
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: process.env.VITEST_MAX_THREADS ? parseInt(process.env.VITEST_MAX_THREADS) : 2,
      },
    },
    // Sequence tests that use database
    sequence: {
      shuffle: false, // Don't shuffle - run in order for reliability
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

