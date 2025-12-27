/**
 * Apply migration SQL directly to database
 * Run: npx tsx scripts/apply-migration.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Applying all pending migrations...')
  
  try {
    // Contact normalization migration
    console.log('\n📞 Applying Contact normalization...')
    await prisma.$executeRaw`
      ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "waId" TEXT;
    `
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "Contact_phoneNormalized_key" ON "Contact"("phoneNormalized") WHERE "phoneNormalized" IS NOT NULL;
    `
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "Contact_waId_key" ON "Contact"("waId") WHERE "waId" IS NOT NULL;
    `
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Contact_phoneNormalized_idx" ON "Contact"("phoneNormalized");
    `
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Contact_waId_idx" ON "Contact"("waId");
    `
    console.log('✅ Contact normalization applied')
    
    // Lead and Conversation fields migration
    console.log('\n📋 Applying Lead and Conversation fields...')
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requestedServiceRaw" TEXT;
    `
    console.log('✅ Added requestedServiceRaw to Lead table')
    
    await prisma.$executeRaw`
      ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastAutoReplyKey" TEXT;
    `
    console.log('✅ Added lastAutoReplyKey to Conversation table')
    
    console.log('\n✅ All migrations applied successfully!')
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

