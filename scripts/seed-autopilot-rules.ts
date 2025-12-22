// Seed default Autopilot rules
// Run with: npx ts-node scripts/seed-autopilot-rules.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding default Autopilot rules...')

  const defaultRules = [
    {
      key: 'followup_due',
      name: 'Follow-up Due',
      enabled: true,
      channel: 'whatsapp',
      schedule: 'daily',
      template:
        'Hi {{name}}, this is {{company}}. Just following up on your {{service}} request. Are you available for a quick call today?',
    },
    {
      key: 'expiry_90',
      name: 'Expiry 90 Days Reminder',
      enabled: true,
      channel: 'whatsapp',
      schedule: 'daily',
      template:
        'Hi {{name}}, reminder: your UAE {{service}} may be due for renewal soon (about {{daysToExpiry}} days left). Would you like us to handle it for you?',
    },
    {
      key: 'overdue',
      name: 'Overdue Escalation',
      enabled: true,
      channel: 'whatsapp',
      schedule: 'daily',
      template:
        'Hi {{name}}, your {{service}} appears overdue. We can help fix it urgently. Reply 1) YES 2) Need price 3) Call me',
    },
  ]

  for (const ruleData of defaultRules) {
    const existing = await prisma.automationRule.findUnique({
      where: { key: ruleData.key },
    })

    if (existing) {
      console.log(`  ✓ Rule "${ruleData.key}" already exists, updating...`)
      await prisma.automationRule.update({
        where: { key: ruleData.key },
        data: {
          name: ruleData.name,
          enabled: ruleData.enabled,
          channel: ruleData.channel,
          schedule: ruleData.schedule,
          template: ruleData.template,
        },
      })
    } else {
      console.log(`  + Creating rule "${ruleData.key}"...`)
      await prisma.automationRule.create({
        data: ruleData,
      })
    }
  }

  console.log('✅ Default rules seeded successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding rules:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })






















