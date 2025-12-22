/**
 * Seed Service Document Requirements
 * 
 * Creates standard document requirements for each service type
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DOCUMENT_REQUIREMENTS: Record<string, Array<{
  documentType: string
  label: string
  isMandatory: boolean
  order: number
  description?: string
}>> = {
  // Visa Services
  'FAMILY_VISA': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'OTHER', label: 'Medical Fitness Certificate', isMandatory: true, order: 4 },
    { documentType: 'OTHER', label: 'Sponsorship Documents', isMandatory: true, order: 5 },
  ],
  'EMPLOYMENT_VISA': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'OTHER', label: 'Medical Fitness Certificate', isMandatory: true, order: 4 },
    { documentType: 'OTHER', label: 'Employment Contract', isMandatory: true, order: 5 },
    { documentType: 'OTHER', label: 'Educational Certificates', isMandatory: false, order: 6 },
  ],
  'INVESTOR_PARTNER_VISA': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'COMPANY_LICENSE', label: 'Company Trade License', isMandatory: true, order: 4 },
    { documentType: 'BANK_STATEMENT', label: 'Bank Statement (6 months)', isMandatory: true, order: 5 },
  ],
  'GOLDEN_VISA': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'BANK_STATEMENT', label: 'Bank Statement (Proving Investment)', isMandatory: true, order: 4 },
    { documentType: 'COMPANY_LICENSE', label: 'Company Documents (if applicable)', isMandatory: false, order: 5 },
  ],
  
  // Business Setup Services
  'MAINLAND_BUSINESS_SETUP': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'COMPANY_LICENSE', label: 'Previous Trade License (if any)', isMandatory: false, order: 4 },
    { documentType: 'EJARI', label: 'Ejari (Office Lease Agreement)', isMandatory: true, order: 5 },
    { documentType: 'BANK_STATEMENT', label: 'Bank Statement (6 months)', isMandatory: false, order: 6 },
  ],
  'FREEZONE_BUSINESS_SETUP': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'COMPANY_LICENSE', label: 'Previous Trade License (if any)', isMandatory: false, order: 4 },
    { documentType: 'BANK_STATEMENT', label: 'Bank Statement (6 months)', isMandatory: false, order: 5 },
  ],
  
  // Renewal Services
  'VISA_RENEWAL': [
    { documentType: 'PASSPORT', label: 'Passport Copy (All Pages)', isMandatory: true, order: 1 },
    { documentType: 'PHOTO', label: 'Passport Size Photo', isMandatory: true, order: 2 },
    { documentType: 'EID', label: 'Emirates ID Copy', isMandatory: true, order: 3 },
    { documentType: 'OTHER', label: 'Previous Visa Copy', isMandatory: true, order: 4 },
    { documentType: 'OTHER', label: 'Medical Fitness Certificate (if required)', isMandatory: false, order: 5 },
  ],
}

async function main() {
  console.log('🌱 Seeding document requirements...')

  for (const [serviceType, requirements] of Object.entries(DOCUMENT_REQUIREMENTS)) {
    for (const req of requirements) {
      try {
        // Check if already exists
        const existing = await prisma.serviceDocumentRequirement.findFirst({
          where: {
            serviceType,
            documentType: req.documentType,
          },
        })

        if (existing) {
          // Update existing
          await prisma.serviceDocumentRequirement.update({
            where: { id: existing.id },
            data: {
              label: req.label,
              isMandatory: req.isMandatory,
              order: req.order,
              description: req.description,
            },
          })
          console.log(`  ✅ Updated: ${serviceType} - ${req.label}`)
        } else {
          // Create new
          await prisma.serviceDocumentRequirement.create({
            data: {
              serviceType,
              documentType: req.documentType,
              label: req.label,
              isMandatory: req.isMandatory,
              order: req.order,
              description: req.description,
            },
          })
          console.log(`  ✅ Created: ${serviceType} - ${req.label}`)
        }
      } catch (error: any) {
        console.error(`  ❌ Failed: ${serviceType} - ${req.label}:`, error.message)
      }
    }
  }

  console.log('✅ Document requirements seeding complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

















