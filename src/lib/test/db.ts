/**
 * Test Database Helper
 * 
 * Ensures TEST_DATABASE_URL is used for all test operations.
 * Provides reliable setup/reset/cleanup.
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

let testPrisma: PrismaClient | null = null

/**
 * Assert TEST_DATABASE_URL exists and is valid
 */
export function assertTestDatabaseUrl(): string {
  const testDbUrl = process.env.TEST_DATABASE_URL
  
  if (!testDbUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for tests. ' +
      'Set it in .env.test or export it before running tests. ' +
      'Example: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/test_db'
    )
  }
  
  // Validate it's not pointing to production
  if (testDbUrl.includes('production') || testDbUrl.includes('prod')) {
    throw new Error('TEST_DATABASE_URL appears to point to production. This is not allowed.')
  }
  
  return testDbUrl
}

/**
 * Get test database Prisma client
 * ALWAYS uses TEST_DATABASE_URL (never dev/prod)
 */
export function getTestPrisma(): PrismaClient {
  if (testPrisma) {
    return testPrisma
  }

  const testDbUrl = assertTestDatabaseUrl()

  testPrisma = new PrismaClient({
    datasources: {
      db: {
        url: testDbUrl,
      },
    },
    log: process.env.VITEST_VERBOSE ? ['query', 'error', 'warn'] : ['error'],
  })

  return testPrisma
}

/**
 * Setup test database (reset + migrate)
 * Uses migrate reset for reliability
 */
export async function setupTestDatabase(): Promise<void> {
  const testDbUrl = assertTestDatabaseUrl()
  
  console.log('📦 Setting up test database...')
  console.log(`   Using: ${testDbUrl.replace(/:[^:@]+@/, ':****@')}`)
  
  // Temporarily set DATABASE_URL for Prisma commands
  const originalDbUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = testDbUrl

  try {
    // Use migrate reset (drops schema, recreates, applies migrations)
    // This is the most reliable approach for tests
    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testDbUrl },
    })
    console.log('✅ Test database reset and migrations applied')
  } catch (error: any) {
    // If migrate reset fails, try db push as fallback
    console.warn('⚠️ migrate reset failed, trying db push...')
    try {
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: testDbUrl },
      })
      console.log('✅ Test database schema pushed')
    } catch (pushError: any) {
      console.error('❌ Test database setup failed:', pushError.message)
      throw pushError
    }
  } finally {
    // Restore original DATABASE_URL
    if (originalDbUrl) {
      process.env.DATABASE_URL = originalDbUrl
    } else {
      delete process.env.DATABASE_URL
    }
  }
}

/**
 * Reset test database (drop all data, keep schema)
 */
export async function resetTestDatabase(): Promise<void> {
  const prisma = getTestPrisma()
  
  try {
    // Delete in order to respect foreign key constraints
    await prisma.outboundMessageLog.deleteMany()
    await prisma.inboundMessageDedup.deleteMany()
    await prisma.autoReplyLog.deleteMany()
    await prisma.messageStatusEvent.deleteMany()
    await prisma.message.deleteMany()
    await prisma.chatMessage.deleteMany()
    await prisma.communicationLog.deleteMany()
    await prisma.conversation.deleteMany()
    await prisma.task.deleteMany()
    await prisma.notification.deleteMany()
    await prisma.lead.deleteMany()
    await prisma.contact.deleteMany()
    await prisma.user.deleteMany()
    
    console.log('🧹 Test database reset (data cleared)')
  } catch (error: any) {
    // If tables don't exist, that's OK (schema not set up yet)
    if (!error.message?.includes('does not exist')) {
      console.warn('⚠️ Error resetting test database:', error.message)
    }
  }
}

/**
 * Close test database connection
 */
export async function closeTestDatabase(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect()
    testPrisma = null
  }
}

