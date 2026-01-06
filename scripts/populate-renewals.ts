/**
 * Automated Renewal Population Script
 * 
 * Populates all Renewal records from existing ExpiryItem data
 * Run with: npx tsx scripts/populate-renewals.ts
 */

import { PrismaClient } from '@prisma/client'
import { populateRenewalsFromExpiryItems } from '../src/lib/renewals/populateFromExpiryItems'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting automated renewal population...\n')

  try {
    // First, do a dry run to see what will be created
    console.log('📊 Step 1: Dry run to analyze data...')
    const dryRunResults = await populateRenewalsFromExpiryItems({
      dryRun: true,
      limit: 10000, // Large limit to get all
    })

    console.log('\n📈 Dry Run Results:')
    console.log(`  - Processed: ${dryRunResults.processed}`)
    console.log(`  - Would Create: ${dryRunResults.created}`)
    console.log(`  - Would Skip: ${dryRunResults.skipped}`)
    if (dryRunResults.errors.length > 0) {
      console.log(`  - Errors: ${dryRunResults.errors.length}`)
      dryRunResults.errors.slice(0, 5).forEach((err) => console.log(`    - ${err}`))
    }

    // Ask for confirmation (in automated mode, we'll proceed)
    console.log('\n✅ Proceeding with actual population...\n')

    // Now do the actual population
    const results = await populateRenewalsFromExpiryItems({
      dryRun: false,
      limit: 10000, // Large limit to get all
    })

    console.log('\n🎉 Population Complete!')
    console.log(`  - Processed: ${results.processed}`)
    console.log(`  - Created: ${results.created}`)
    console.log(`  - Skipped: ${results.skipped}`)
    if (results.errors.length > 0) {
      console.log(`  - Errors: ${results.errors.length}`)
      results.errors.slice(0, 10).forEach((err) => console.log(`    - ${err}`))
    }

    // Show summary statistics
    const renewalCount = await prisma.renewal.count()
    const pendingCount = await prisma.renewal.count({
      where: { status: 'PENDING' },
    })
    const withNextReminder = await prisma.renewal.count({
      where: {
        nextReminderAt: { not: null },
      },
    })

    console.log('\n📊 Renewal Statistics:')
    console.log(`  - Total Renewals: ${renewalCount}`)
    console.log(`  - Pending: ${pendingCount}`)
    console.log(`  - With Next Reminder Scheduled: ${withNextReminder}`)
  } catch (error: any) {
    console.error('❌ Error during population:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

