import { prisma } from './prisma'

/**
 * Seed default automation rules if none exist
 * Safe to call multiple times - will not duplicate
 */
export async function ensureAutomationRulesSeeded() {
  try {
    // Check if any rules exist
    const existingRules = await prisma.automationRule.findMany()
    
    if (existingRules.length > 0) {
      return // Already seeded
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

    console.log('✅ Seeded default automation rules')
  } catch (error: any) {
    // If table doesn't exist yet, silently fail
    if (error.message?.includes('does not exist') || error.code === 'P2001') {
      console.warn('⚠️ AutomationRule table not found. Run migrations first.')
    } else {
      console.error('❌ Error seeding automation rules:', error)
    }
  }
}







