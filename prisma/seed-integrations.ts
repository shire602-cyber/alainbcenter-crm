/**
 * Seed script to ensure all integrations exist in the database
 * Run with: npx tsx prisma/seed-integrations.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const integrations = [
  {
    name: 'whatsapp',
    provider: 'Meta Cloud API',
    isEnabled: false,
    config: JSON.stringify({}),
  },
  {
    name: 'email',
    provider: 'Gmail',
    isEnabled: false,
    config: JSON.stringify({}),
  },
  {
    name: 'facebook',
    provider: 'Meta Lead Ads',
    isEnabled: false,
    config: JSON.stringify({}),
  },
  {
    name: 'instagram',
    provider: 'Meta Lead Ads',
    isEnabled: false,
    config: JSON.stringify({}),
  },
  {
    name: 'openai',
    provider: 'OpenAI API',
    isEnabled: false,
    config: JSON.stringify({ model: 'gpt-4' }),
  },
]

async function main() {
  console.log('Seeding integrations...')

  for (const integration of integrations) {
    await prisma.integration.upsert({
      where: { name: integration.name },
      update: {
        // Don't overwrite existing settings, only ensure it exists
        provider: integration.provider,
      },
      create: integration,
    })
    console.log(`✅ ${integration.name} integration ready`)
  }

  console.log('✅ All integrations seeded!')
}

main()
  .catch((e) => {
    console.error('Error seeding integrations:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
