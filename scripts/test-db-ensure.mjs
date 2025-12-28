#!/usr/bin/env node

/**
 * Test Database Setup Script
 * 
 * Ensures TEST_DATABASE_URL is set and database is ready before running tests.
 * Run this before `npm test` to ensure test DB is set up.
 */

import { execSync } from 'child_process'

const testDbUrl = process.env.TEST_DATABASE_URL

if (!testDbUrl) {
  console.error('❌ TEST_DATABASE_URL is not set')
  console.error('')
  console.error('Please set TEST_DATABASE_URL before running tests:')
  console.error('  export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"')
  console.error('  # or add it to .env.test')
  console.error('')
  process.exit(1)
}

// Validate it's not production
if (testDbUrl.includes('production') || testDbUrl.includes('prod')) {
  console.error('❌ TEST_DATABASE_URL appears to point to production')
  console.error('   This is not allowed for safety.')
  process.exit(1)
}

console.log('✅ TEST_DATABASE_URL is set')
console.log(`   Using: ${testDbUrl.replace(/:[^:@]+@/, ':****@')}`)

// Check if we should reset (if TEST_DB_RESET env var is set)
if (process.env.TEST_DB_RESET === 'true') {
  console.log('🔄 Resetting test database...')
  try {
    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testDbUrl },
    })
    console.log('✅ Test database reset complete')
  } catch (error) {
    console.error('❌ Failed to reset test database:', error.message)
    process.exit(1)
  }
} else {
  console.log('ℹ️  Skipping reset (set TEST_DB_RESET=true to reset)')
}

console.log('✅ Test database ready')

