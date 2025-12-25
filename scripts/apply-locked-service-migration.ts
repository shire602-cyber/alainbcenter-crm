/**
 * Apply lockedService migration to Conversation table
 * 
 * This script applies the migration directly to the database
 * since Prisma migrate has provider mismatch issues
 */

import { prisma } from '../src/lib/prisma'

async function applyMigration() {
  console.log('🔄 Applying lockedService migration...')
  
  try {
    // Check if column already exists
    const checkResult = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Conversation' 
      AND column_name = 'lockedService'
    `
    
    if (checkResult.length > 0) {
      console.log('✅ Column "lockedService" already exists - skipping migration')
      return
    }
    
    // Apply migration
    console.log('📝 Adding lockedService column to Conversation table...')
    await prisma.$executeRaw`
      ALTER TABLE "Conversation" ADD COLUMN "lockedService" TEXT
    `
    
    console.log('✅ Migration applied successfully!')
    console.log('   Column "lockedService" added to Conversation table')
    
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
      console.log('✅ Column already exists - migration already applied')
    } else {
      console.error('❌ Migration failed:', error.message)
      throw error
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Run migration
applyMigration()
  .then(() => {
    console.log('\n✅ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error)
    process.exit(1)
  })

