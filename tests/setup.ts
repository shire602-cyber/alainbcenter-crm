/**
 * Test Setup
 * 
 * Global test configuration and cleanup
 * Uses TEST_DATABASE_URL (required)
 */

import { beforeAll, afterAll, beforeEach } from 'vitest'
import { 
  assertTestDatabaseUrl, 
  getTestPrisma, 
  resetTestDatabase, 
  closeTestDatabase 
} from '@/lib/test/db'

// Assert TEST_DATABASE_URL is set before any tests run
beforeAll(async () => {
  try {
    assertTestDatabaseUrl()
    console.log('✅ TEST_DATABASE_URL validated')
  } catch (error: any) {
    console.error('❌', error.message)
    throw error
  }
})

// Reset database before each test suite (clean slate)
beforeEach(async () => {
  // Only reset if explicitly requested (to avoid slow tests)
  if (process.env.TEST_RESET_BEFORE_EACH === 'true') {
    await resetTestDatabase()
  }
})

// Cleanup after all tests
afterAll(async () => {
  try {
    await closeTestDatabase()
  } catch (error: any) {
    // Ignore cleanup errors
  }
})

