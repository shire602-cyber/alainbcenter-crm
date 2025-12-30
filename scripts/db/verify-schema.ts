#!/usr/bin/env tsx
/**
 * TASK 4: Schema Verification Script
 * 
 * Verifies that required columns exist in the database:
 * - Conversation.deletedAt
 * - Notification.snoozedUntil
 * 
 * Exits with non-zero code if schema mismatch detected.
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/db/verify-schema.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Verifying database schema...\n')

  let hasErrors = false
  const errors: string[] = []

  // Check Conversation.deletedAt
  try {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Conversation' 
        AND column_name = 'deletedAt'
    `
    
    if (result.length === 0) {
      hasErrors = true
      errors.push('Conversation.deletedAt column does not exist')
      console.error('❌ Conversation.deletedAt: MISSING')
    } else {
      console.log('✅ Conversation.deletedAt: EXISTS')
    }
  } catch (error: any) {
    hasErrors = true
    errors.push(`Error checking Conversation.deletedAt: ${error.message}`)
    console.error('❌ Conversation.deletedAt: ERROR -', error.message)
  }

  // Check Notification.snoozedUntil
  try {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Notification' 
        AND column_name = 'snoozedUntil'
    `
    
    if (result.length === 0) {
      hasErrors = true
      errors.push('Notification.snoozedUntil column does not exist')
      console.error('❌ Notification.snoozedUntil: MISSING')
    } else {
      console.log('✅ Notification.snoozedUntil: EXISTS')
    }
  } catch (error: any) {
    hasErrors = true
    errors.push(`Error checking Notification.snoozedUntil: ${error.message}`)
    console.error('❌ Notification.snoozedUntil: ERROR -', error.message)
  }

  // Check indexes
  try {
    const deletedAtIndex = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Conversation' 
        AND indexname = 'Conversation_deletedAt_idx'
    `
    
    if (deletedAtIndex.length === 0) {
      console.warn('⚠️  Conversation_deletedAt_idx: MISSING (non-critical)')
    } else {
      console.log('✅ Conversation_deletedAt_idx: EXISTS')
    }
  } catch (error: any) {
    console.warn('⚠️  Error checking Conversation_deletedAt_idx:', error.message)
  }

  try {
    const snoozedUntilIndex = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Notification' 
        AND indexname = 'Notification_snoozedUntil_idx'
    `
    
    if (snoozedUntilIndex.length === 0) {
      console.warn('⚠️  Notification_snoozedUntil_idx: MISSING (non-critical)')
    } else {
      console.log('✅ Notification_snoozedUntil_idx: EXISTS')
    }
  } catch (error: any) {
    console.warn('⚠️  Error checking Notification_snoozedUntil_idx:', error.message)
  }

  console.log('')

  if (hasErrors) {
    console.error('❌ Schema verification FAILED\n')
    console.error('Errors found:')
    errors.forEach((err) => console.error(`  - ${err}`))
    console.error('\nTo fix, run:')
    console.error('  npx prisma migrate deploy')
    console.error('\nOr apply migration manually:')
    console.error('  See: prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql')
    process.exit(1)
  } else {
    console.log('✅ Schema verification PASSED')
    process.exit(0)
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

