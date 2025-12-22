/**
 * Test script for renewals engine
 * Run with: npx tsx scripts/test-renewals-engine.ts
 */

import { runRenewalEngine } from '../src/lib/renewals/engine'

async function testRenewalsEngine() {
  console.log('🧪 Testing Renewals Engine...\n')

  try {
    // Test dry run first
    console.log('📋 Running DRY RUN test...')
    const dryRunResult = await runRenewalEngine({ dryRun: true })
    
    console.log('\n✅ Dry Run Results:')
    console.log(`   Total Expiry Items Checked: ${dryRunResult.totalExpiryChecked}`)
    console.log(`   Total Reminders Scheduled: ${dryRunResult.totalRemindersScheduled}`)
    console.log(`   By Stage:`)
    console.log(`     90D: ${dryRunResult.byStage['90D']}`)
    console.log(`     60D: ${dryRunResult.byStage['60D']}`)
    console.log(`     30D: ${dryRunResult.byStage['30D']}`)
    console.log(`     7D: ${dryRunResult.byStage['7D']}`)
    console.log(`     EXPIRED: ${dryRunResult.byStage['EXPIRED']}`)
    
    if (dryRunResult.errors.length > 0) {
      console.log(`\n⚠️  Errors (${dryRunResult.errors.length}):`)
      dryRunResult.errors.forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error}`)
      })
    } else {
      console.log('\n✅ No errors in dry run!')
    }

    // Ask if user wants to run actual engine
    console.log('\n' + '='.repeat(50))
    console.log('Dry run completed successfully!')
    console.log('To run the actual engine (creates tasks), run:')
    console.log('  npx tsx scripts/test-renewals-engine.ts --run')
    console.log('='.repeat(50))

    // If --run flag is passed, run actual engine
    if (process.argv.includes('--run')) {
      console.log('\n🚀 Running ACTUAL engine (will create tasks)...')
      const actualResult = await runRenewalEngine({ dryRun: false })
      
      console.log('\n✅ Actual Run Results:')
      console.log(`   Total Expiry Items Checked: ${actualResult.totalExpiryChecked}`)
      console.log(`   Total Reminders Scheduled: ${actualResult.totalRemindersScheduled}`)
      console.log(`   By Stage:`)
      console.log(`     90D: ${actualResult.byStage['90D']}`)
      console.log(`     60D: ${actualResult.byStage['60D']}`)
      console.log(`     30D: ${actualResult.byStage['30D']}`)
      console.log(`     7D: ${actualResult.byStage['7D']}`)
      console.log(`     EXPIRED: ${actualResult.byStage['EXPIRED']}`)
      
      if (actualResult.errors.length > 0) {
        console.log(`\n⚠️  Errors (${actualResult.errors.length}):`)
        actualResult.errors.forEach((error, idx) => {
          console.log(`   ${idx + 1}. ${error}`)
        })
      } else {
        console.log('\n✅ No errors in actual run!')
      }
    }

    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ Test failed with error:')
    console.error(error)
    console.error('\nStack trace:')
    console.error(error?.stack)
    process.exit(1)
  }
}

testRenewalsEngine()

