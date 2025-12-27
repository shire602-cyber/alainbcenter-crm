/**
 * Apply migration SQL directly to database
 * Run: npx tsx scripts/apply-migration.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Applying migration: add_requested_service_raw_and_reply_key')
  
  try {
    // Add requestedServiceRaw to Lead
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requestedServiceRaw" TEXT;
    `
    console.log('✅ Added requestedServiceRaw to Lead table')
    
    // Add lastAutoReplyKey to Conversation
    await prisma.$executeRaw`
      ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastAutoReplyKey" TEXT;
    `
    console.log('✅ Added lastAutoReplyKey to Conversation table')
    
    console.log('✅ Migration applied successfully!')
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

