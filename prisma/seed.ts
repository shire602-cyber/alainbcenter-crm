/**
 * Prisma Seed Script
 * 
 * Seeds ServiceType records for deterministic serviceTypeId resolution.
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * ServiceType enum values that must exist in database
 * Maps to Lead.serviceTypeEnum values
 */
const SERVICE_TYPES = [
  { code: 'MAINLAND_BUSINESS_SETUP', name: 'Mainland Business Setup' },
  { code: 'FREEZONE_BUSINESS_SETUP', name: 'Freezone Business Setup' },
  { code: 'OFFSHORE_COMPANY', name: 'Offshore Company' },
  { code: 'BRANCH_SUBSIDIARY_SETUP', name: 'Branch/Subsidiary Setup' },
  { code: 'BANK_ACCOUNT_ASSISTANCE', name: 'Bank Account Assistance' },
  { code: 'ACCOUNTING_VAT_SERVICES', name: 'Accounting & VAT Services' },
  { code: 'EMPLOYMENT_VISA', name: 'Employment Visa' },
  { code: 'FAMILY_VISA', name: 'Family Visa' },
  { code: 'FREELANCE_VISA', name: 'Freelance Visa' },
  { code: 'INVESTOR_PARTNER_VISA', name: 'Investor/Partner Visa' },
  { code: 'GOLDEN_VISA', name: 'Golden Visa' },
  { code: 'DOMESTIC_WORKER_VISA', name: 'Domestic Worker Visa' },
  { code: 'VISIT_VISA', name: 'Visit Visa' },
  { code: 'EMIRATES_ID', name: 'Emirates ID' },
  { code: 'MEDICAL_BIOMETRICS', name: 'Medical & Biometrics' },
  { code: 'VISA_RENEWAL', name: 'Visa Renewal' },
  { code: 'VISA_CANCELLATION', name: 'Visa Cancellation' },
  { code: 'STATUS_CHANGE_INSIDE_UAE', name: 'Status Change Inside UAE' },
]

async function main() {
  console.log('🌱 Seeding ServiceType records...')
  
  for (const serviceType of SERVICE_TYPES) {
    const existing = await prisma.serviceType.findUnique({
      where: { code: serviceType.code },
    })
    
    if (existing) {
      console.log(`  ✓ ${serviceType.code} already exists (ID: ${existing.id})`)
    } else {
      const created = await prisma.serviceType.create({
        data: {
          code: serviceType.code,
          name: serviceType.name,
          isActive: true,
        },
      })
      console.log(`  ✓ Created ${serviceType.code} (ID: ${created.id})`)
    }
  }
  
  console.log('✅ ServiceType seeding completed!')
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

