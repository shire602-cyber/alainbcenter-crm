/**
 * PHASE 5E: Verification Script for Quote Follow-ups
 * 
 * Creates a lead, triggers scheduleQuoteFollowups twice, and asserts only 5 tasks exist.
 */

import { PrismaClient } from '@prisma/client'
import { scheduleQuoteFollowups } from '../src/lib/followups/quoteFollowups'

const prisma = new PrismaClient()

async function main() {
  console.log('🧪 Starting quote follow-ups verification...\n')

  try {
    // Step 1: Create a test lead
    console.log('Step 1: Creating test lead...')
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Test Quote Follow-up Lead',
        phone: `+971${Date.now().toString().slice(-9)}`,
        email: `test-quote-${Date.now()}@example.com`,
      },
    })

    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'QUALIFIED',
        pipelineStage: 'qualified',
      },
    })

    console.log(`✅ Created lead ${lead.id} with contact ${contact.id}\n`)

    // Step 2: Trigger scheduleQuoteFollowups first time
    console.log('Step 2: Triggering scheduleQuoteFollowups (first time)...')
    const result1 = await scheduleQuoteFollowups({
      leadId: lead.id,
      sentAt: new Date(),
    })

    console.log(`✅ First run: Created ${result1.created}, Skipped ${result1.skipped}`)
    expect(result1.created).toBe(5)
    expect(result1.skipped).toBe(0)

    // Step 3: Verify exactly 5 tasks exist
    const tasks1 = await prisma.task.findMany({
      where: {
        leadId: lead.id,
        title: {
          startsWith: 'Quote follow-up D+',
        },
      },
    })

    console.log(`✅ Found ${tasks1.length} tasks after first run`)
    expect(tasks1.length).toBe(5)

    // Step 4: Trigger scheduleQuoteFollowups second time (should be idempotent)
    console.log('\nStep 3: Triggering scheduleQuoteFollowups (second time - should be idempotent)...')
    const result2 = await scheduleQuoteFollowups({
      leadId: lead.id,
      sentAt: new Date(),
    })

    console.log(`✅ Second run: Created ${result2.created}, Skipped ${result2.skipped}`)
    expect(result2.created).toBe(0)
    expect(result2.skipped).toBe(5)

    // Step 5: Verify still exactly 5 tasks exist (no duplicates)
    const tasks2 = await prisma.task.findMany({
      where: {
        leadId: lead.id,
        title: {
          startsWith: 'Quote follow-up D+',
        },
      },
    })

    console.log(`✅ Found ${tasks2.length} tasks after second run (should still be 5)`)
    expect(tasks2.length).toBe(5)

    // Step 6: Verify task due dates
    console.log('\nStep 4: Verifying task due dates...')
    const cadences = [3, 5, 7, 9, 12]
    const sentAt = new Date()
    sentAt.setHours(10, 0, 0, 0)

    for (const cadence of cadences) {
      const task = tasks2.find((t) => t.title === `Quote follow-up D+${cadence}`)
      if (!task) {
        throw new Error(`Task for D+${cadence} not found`)
      }

      const expectedDueAt = new Date(sentAt)
      expectedDueAt.setDate(expectedDueAt.getDate() + cadence)
      expectedDueAt.setHours(10, 0, 0, 0)

      const actualDueAt = new Date(task.dueAt!)
      const daysDiff = Math.floor((actualDueAt.getTime() - expectedDueAt.getTime()) / (1000 * 60 * 60 * 24))

      console.log(`  D+${cadence}: Due ${actualDueAt.toISOString().split('T')[0]} (expected: ${expectedDueAt.toISOString().split('T')[0]})`)
      
      // Allow 1 day tolerance for timezone differences
      if (Math.abs(daysDiff) > 1) {
        throw new Error(`Task D+${cadence} due date is off by ${daysDiff} days`)
      }
    }

    console.log('\n✅ All verifications passed!')
    console.log('\nCleaning up test data...')

    // Cleanup
    await prisma.task.deleteMany({
      where: { leadId: lead.id },
    })
    await prisma.lead.delete({
      where: { id: lead.id },
    })
    await prisma.contact.delete({
      where: { id: contact.id },
    })

    console.log('✅ Cleanup complete')
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Simple expect function for script
function expect(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

main()

