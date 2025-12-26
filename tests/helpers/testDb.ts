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
  const testDbUrl = process.env.TEST_DATABASE_URL || 
    process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/test_db') ||
    'postgresql://localhost:5432/test_db'

  console.log('📦 Setting up test database...')
  
  // Set DATABASE_URL for Prisma migrate
  process.env.DATABASE_URL = testDbUrl

  try {
    // Run migrations
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testDbUrl },
    })
    console.log('✅ Test database migrations applied')
  } catch (error: any) {
    console.warn('⚠️ Migration failed (might already be applied):', error.message)
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

