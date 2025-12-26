/**
 * Test Setup
 * 
 * Global test configuration and cleanup
 */

import { beforeAll, afterAll } from 'vitest'
import { setupTestDb, closeTestDb } from './helpers/testDb'

// Setup test database before all tests
beforeAll(async () => {
  // Only setup if TEST_DATABASE_URL is explicitly set
  // Tests will skip if database is not available
  if (process.env.TEST_DATABASE_URL) {
    try {
      await setupTestDb()
    } catch (error: any) {
      console.warn('⚠️ Test database setup failed (tests may be skipped):', error.message)
    }
  } else {
    console.warn('⚠️ TEST_DATABASE_URL not set - integration tests will be skipped')
  }
})

// Cleanup after all tests
afterAll(async () => {
  try {
    await closeTestDb()
  } catch (error: any) {
    // Ignore cleanup errors
  }
})

