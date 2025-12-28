/**
 * Test Setup
 * 
 * Global test configuration and cleanup
 */

import { beforeAll, afterAll } from 'vitest'
import { setupTestDb, closeTestDb } from './helpers/testDb'

// Setup test database before all tests
beforeAll(async () => {
  // Default to SQLite if TEST_DATABASE_URL not set
  if (!process.env.TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = 'file:./test.db'
    console.log('📦 Using default SQLite test database: test.db')
  }
  
  try {
    await setupTestDb()
  } catch (error: any) {
    console.error('❌ Test database setup failed:', error.message)
    // Don't skip tests - fail fast
    throw error
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

