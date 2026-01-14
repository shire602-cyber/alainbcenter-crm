/**
 * Manual migration script for Meta OAuth token fields
 * Run this if automatic migration fails: npx tsx scripts/apply-meta-oauth-migration.ts
 */

import { prisma } from '@/lib/prisma'

async function applyMigration() {
  console.log('🔄 Applying Meta OAuth migration...')

  try {
    // Check if columns already exist
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'meta_connections' 
      AND column_name IN ('meta_user_access_token_long', 'meta_user_token_expires_at', 'meta_connected_at')
    `

    const existingColumns = result.map(r => r.column_name)
    const allColumns = ['meta_user_access_token_long', 'meta_user_token_expires_at', 'meta_connected_at']
    const missingColumns = allColumns.filter(col => !existingColumns.includes(col))

    if (missingColumns.length === 0) {
      console.log('✅ All columns already exist. Migration not needed.')
      return
    }

    console.log(`📝 Adding missing columns: ${missingColumns.join(', ')}`)

    // Add missing columns
    if (missingColumns.includes('meta_user_access_token_long')) {
      await prisma.$executeRaw`
        ALTER TABLE "meta_connections" 
        ADD COLUMN IF NOT EXISTS "meta_user_access_token_long" TEXT
      `
      console.log('✅ Added meta_user_access_token_long')
    }

    if (missingColumns.includes('meta_user_token_expires_at')) {
      await prisma.$executeRaw`
        ALTER TABLE "meta_connections" 
        ADD COLUMN IF NOT EXISTS "meta_user_token_expires_at" TIMESTAMP(3)
      `
      console.log('✅ Added meta_user_token_expires_at')
    }

    if (missingColumns.includes('meta_connected_at')) {
      await prisma.$executeRaw`
        ALTER TABLE "meta_connections" 
        ADD COLUMN IF NOT EXISTS "meta_connected_at" TIMESTAMP(3)
      `
      console.log('✅ Added meta_connected_at')
    }

    console.log('✅ Migration completed successfully!')
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration()
