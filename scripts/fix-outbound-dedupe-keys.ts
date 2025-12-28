/**
 * Fix script for outboundDedupeKey null values
 * 
 * This script backfills existing OutboundMessageLog rows with null outboundDedupeKey
 * and updates the unique index to allow nulls.
 * 
 * Usage:
 *   npx tsx scripts/fix-outbound-dedupe-keys.ts
 */

import { prisma } from '../src/lib/prisma'

async function fixOutboundDedupeKeys() {
  console.log('🔧 Starting fix for outboundDedupeKey null values...\n')

  try {
    // Step 1: Count existing rows with null outboundDedupeKey
    // Using PostgreSQL-specific syntax
    const nullCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM "OutboundMessageLog"
      WHERE "outboundDedupeKey" IS NULL
    `
    
    const count = Number(nullCount[0]?.count || 0)
    console.log(`📊 Found ${count} rows with null outboundDedupeKey`)

    if (count === 0) {
      console.log('✅ No rows need fixing. All rows already have outboundDedupeKey.')
      return
    }

    // Step 2: Backfill existing rows with generated keys
    // Using PostgreSQL string concatenation and EXTRACT
    console.log('\n🔄 Backfilling null values...')
    const updateResult = await prisma.$executeRaw`
      UPDATE "OutboundMessageLog" 
      SET "outboundDedupeKey" = 'legacy_' || id::text || '_' || "conversationId"::text || '_' || COALESCE("triggerProviderMessageId", 'none') || '_' || EXTRACT(EPOCH FROM "createdAt")::bigint::text
      WHERE "outboundDedupeKey" IS NULL
    `
    
    console.log(`✅ Updated ${updateResult} rows`)

    // Step 3: Drop the old unique index if it exists
    console.log('\n🔄 Updating unique index...')
    try {
      await prisma.$executeRaw`
        DROP INDEX IF EXISTS "OutboundMessageLog_outboundDedupeKey_key"
      `
      console.log('✅ Dropped old index')
    } catch (error: any) {
      console.log(`⚠️  Could not drop index (may not exist): ${error.message}`)
    }

    // Step 4: Create partial unique index (allows multiple NULLs, enforces uniqueness for non-null values)
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessageLog_outboundDedupeKey_key" 
        ON "OutboundMessageLog"("outboundDedupeKey") 
        WHERE "outboundDedupeKey" IS NOT NULL
    `
    console.log('✅ Created partial unique index')

    // Step 5: Verify
    // Using PostgreSQL COUNT with explicit casting
    console.log('\n🔍 Verifying fix...')
    const verifyResult = await prisma.$queryRaw<Array<{
      total_rows: bigint
      rows_with_key: bigint
      rows_without_key: bigint
    }>>`
      SELECT 
        COUNT(*)::bigint as total_rows,
        COUNT("outboundDedupeKey")::bigint as rows_with_key,
        (COUNT(*) - COUNT("outboundDedupeKey"))::bigint as rows_without_key
      FROM "OutboundMessageLog"
    `
    
    const stats = verifyResult[0]
    console.log(`\n📊 Final Stats:`)
    console.log(`   Total rows: ${stats.total_rows}`)
    console.log(`   Rows with key: ${stats.rows_with_key}`)
    console.log(`   Rows without key: ${stats.rows_without_key}`)

    if (Number(stats.rows_without_key) === 0) {
      console.log('\n✅ SUCCESS! All rows now have outboundDedupeKey.')
    } else {
      console.log(`\n⚠️  WARNING: ${stats.rows_without_key} rows still missing outboundDedupeKey`)
    }

  } catch (error: any) {
    console.error('\n❌ Error fixing outboundDedupeKey:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the fix
fixOutboundDedupeKeys()
  .then(() => {
    console.log('\n✅ Fix script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fix script failed:', error)
    process.exit(1)
  })

