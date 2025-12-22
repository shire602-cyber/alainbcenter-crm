import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedAutomationRules() {
  try {
    // Check if any rules exist
    const existingRules = await prisma.automationRule.findMany()
    
    if (existingRules.length > 0) {
      console.log(`✅ Automation rules already exist (${existingRules.length} rules). Skipping seed.`)
      return
    }

    // Seed default expiry reminder rules
    const expiryRules = [
      { daysBeforeExpiry: 90, name: '90 Days Before Expiry Reminder' },
      { daysBeforeExpiry: 30, name: '30 Days Before Expiry Reminder' },
      { daysBeforeExpiry: 7, name: '7 Days Before Expiry Reminder' },
      { daysBeforeExpiry: 1, name: '1 Day Before Expiry Reminder' },
    ]

    for (const rule of expiryRules) {
      await prisma.automationRule.create({
        data: {
          name: rule.name,
          type: 'expiry_reminder',
          channel: 'whatsapp',
          daysBeforeExpiry: rule.daysBeforeExpiry,
          isActive: true,
        },
      })
    }

    // Seed follow-up rule
    await prisma.automationRule.create({
      data: {
        name: 'Follow-up After 2 Days',
        type: 'followup_due',
        channel: 'whatsapp',
        followupAfterDays: 2,
        isActive: true,
      },
    })

    console.log('✅ Successfully seeded default automation rules!')
    console.log(`   - Created ${expiryRules.length} expiry reminder rules`)
    console.log('   - Created 1 follow-up rule')
  } catch (error) {
    console.error('❌ Error seeding automation rules:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedAutomationRules()
