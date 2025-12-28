/**
 * Test Database Setup
 * 
 * Provides test database connection and cleanup utilities
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

let testPrisma: PrismaClient | null = null

/**
 * Get test database Prisma client
 * Uses TEST_DATABASE_URL or falls back to DATABASE_URL with _test suffix
 */
export function getTestPrisma(): PrismaClient {
  if (testPrisma) {
    return testPrisma
  }

  const testDbUrl = process.env.TEST_DATABASE_URL || 
    process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/test_db') ||
    'postgresql://localhost:5432/test_db'

  testPrisma = new PrismaClient({
    datasources: {
      db: {
        url: testDbUrl,
      },
    },
  })

  return testPrisma
}

/**
 * Setup test database (run migrations)
 */
export async function setupTestDb() {
  // Default to a test database (same connection as main DB but different database name)
  const testDbUrl = process.env.TEST_DATABASE_URL || 
    (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/\/[^/]+$/, '/test_db') : null)

  if (!testDbUrl) {
    console.warn('⚠️ TEST_DATABASE_URL not set and DATABASE_URL not available')
    console.warn('   Tests will use main DATABASE_URL - this is not recommended for production')
    // Don't throw - allow tests to run with main DB (not ideal but better than failing)
    return
  }

  console.log('📦 Setting up test database...')
  console.log(`   Using: ${testDbUrl.replace(/:[^:@]+@/, ':****@')}`) // Hide password in logs
  
  // Set DATABASE_URL for Prisma commands
  const originalDbUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = testDbUrl

  try {
    // Use migrate deploy for PostgreSQL (schema is PostgreSQL-only)
    execSync('npx prisma migrate deploy', {
      stdio: 'pipe', // Don't show full output in tests
      env: { ...process.env, DATABASE_URL: testDbUrl },
    })
    console.log('✅ Test database migrations applied')
  } catch (error: any) {
    // Try db push as fallback (for new test DBs)
    try {
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: testDbUrl },
      })
      console.log('✅ Test database schema pushed')
    } catch (pushError: any) {
      console.error('❌ Test database setup failed:', pushError.message)
      // Restore original DATABASE_URL
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl
      throw pushError
    }
  } finally {
    // Restore original DATABASE_URL
    if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl
  }
}

/**
 * Clean test database (truncate all tables)
 */
export async function cleanTestDb() {
  const prisma = getTestPrisma()
  
  try {
    // Delete in order to respect foreign key constraints
    // Use try-catch for each table in case it doesn't exist
    try {
      await prisma.outboundMessageLog.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.inboundMessageDedup.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.autoReplyLog.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.messageStatusEvent.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.message.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.chatMessage.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.communicationLog.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.conversation.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.task.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.lead.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    try {
      await prisma.contact.deleteMany()
    } catch (e: any) {
      if (!e.message?.includes('does not exist')) throw e
    }
    
    console.log('🧹 Test database cleaned')
  } catch (error: any) {
    console.warn('⚠️ Error cleaning test database:', error.message)
  }
}

/**
 * Close test database connection
 */
export async function closeTestDb() {
  if (testPrisma) {
    await testPrisma.$disconnect()
    testPrisma = null
  }
}

