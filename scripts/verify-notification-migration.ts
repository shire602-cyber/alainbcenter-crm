/**
 * Verify Notification.snoozedUntil migration was applied successfully
 * 
 * Run with: npx tsx scripts/verify-notification-migration.ts
 */

import { prisma } from '../src/lib/prisma'

async function verifyMigration() {
  console.log('🔍 Verifying Notification.snoozedUntil migration...')
  
  try {
    // Check if column exists
    const columnCheck = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Notification' 
        AND column_name = 'snoozedUntil'
    `
    
    if (columnCheck.length === 0) {
      console.log('❌ snoozedUntil column NOT found')
      console.log('   Migration may not have been applied')
      return false
    }
    
    console.log('✅ snoozedUntil column exists')
    console.log(`   Type: ${columnCheck[0].data_type}`)
    
    // Check if index exists
    const indexCheck = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Notification' 
        AND indexname = 'Notification_snoozedUntil_idx'
    `
    
    if (indexCheck.length === 0) {
      console.log('⚠️  snoozedUntil index NOT found (non-critical)')
    } else {
      console.log('✅ snoozedUntil index exists')
    }
    
    // Test query to ensure it works
    try {
      const testQuery = await prisma.notification.findMany({
        where: {
          OR: [
            { snoozedUntil: null },
            { snoozedUntil: { lt: new Date() } },
          ],
        },
        take: 1,
      })
      console.log('✅ Test query successful - migration is working!')
      console.log(`   Found ${testQuery.length} notification(s) matching query`)
    } catch (queryError: any) {
      console.error('❌ Test query failed:', queryError.message)
      return false
    }
    
    console.log('')
    console.log('✅ MIGRATION VERIFICATION: SUCCESS')
    console.log('   The snoozedUntil column is present and functional')
    
    return true
    
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

verifyMigration()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

