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
    
    // Deal Forecast migration
    console.log('\n📊 Applying Deal Forecast fields...')
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "dealProbability" INTEGER;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "expectedRevenueAED" INTEGER;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "forecastReasonJson" TEXT;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "serviceFeeAED" INTEGER;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "stageProbabilityOverride" INTEGER;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "forecastModelVersion" TEXT;
    `
    await prisma.$executeRaw`
      ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "forecastLastComputedAt" TIMESTAMP;
    `
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Lead_dealProbability_idx" ON "Lead"("dealProbability");
    `
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "Lead_expectedRevenueAED_idx" ON "Lead"("expectedRevenueAED");
    `
    console.log('✅ Deal Forecast fields applied')
    
    // ServicePricing table
    console.log('\n💰 Checking ServicePricing table...')
    try {
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'ServicePricing'
        );
      `
      if (!(tableExists as any[])[0]?.exists) {
        await prisma.$executeRaw`
          CREATE TABLE "ServicePricing" (
            "id" SERIAL PRIMARY KEY,
            "serviceKey" TEXT UNIQUE NOT NULL,
            "defaultFeeAED" INTEGER NOT NULL,
            "minFeeAED" INTEGER,
            "maxFeeAED" INTEGER,
            "serviceTypeId" INTEGER,
            "isActive" BOOLEAN DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL
          );
        `
        await prisma.$executeRaw`
          CREATE INDEX IF NOT EXISTS "ServicePricing_serviceKey_idx" ON "ServicePricing"("serviceKey");
        `
        console.log('✅ Created ServicePricing table')
      } else {
        console.log('✅ ServicePricing table already exists')
      }
    } catch (error: any) {
      console.log('⚠️ ServicePricing table check skipped:', error.message)
    }
    
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

