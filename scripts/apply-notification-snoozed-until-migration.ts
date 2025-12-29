/**
 * Apply Notification.snoozedUntil migration
 * 
 * This script applies the migration for the snoozedUntil column.
 * Run with: npx tsx scripts/apply-notification-snoozed-until-migration.ts
 */

import { prisma } from '../src/lib/prisma'

async function applyMigration() {
  console.log('🔄 Applying Notification.snoozedUntil migration...')
  
  try {
    // Check if column already exists
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Notification' 
        AND column_name = 'snoozedUntil'
    `
    
    if (result.length > 0) {
      console.log('✅ snoozedUntil column already exists - skipping')
      return
    }
    
    // Add column
    await prisma.$executeRaw`
      ALTER TABLE "Notification" 
      ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3)
    `
    
    console.log('✅ Added snoozedUntil column')
    
    // Create index
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Notification_snoozedUntil_idx" 
      ON "Notification"("snoozedUntil")
    `
    
    console.log('✅ Created snoozedUntil index')
    
    // Mark migration as applied in Prisma migration history
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        gen_random_uuid()::text,
        '',
        NOW(),
        '20251229190109_add_notification_snoozed_until',
        NULL,
        NULL,
        NOW(),
        1
      )
      ON CONFLICT DO NOTHING
    `
    
    console.log('✅ Migration applied successfully!')
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration()
  .then(() => {
    console.log('✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

