/**
 * Seed Document & Compliance Automation Rules
 * 
 * Creates automation rules for:
 * 1. Missing mandatory docs when stage changes to QUALIFIED
 * 2. Document expiry reminders
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedDocumentAutomationRules() {
  try {
    console.log('🌱 Seeding document & compliance automation rules...')

    // Rule 1: Missing Mandatory Docs when Stage = QUALIFIED
    const missingDocsRule = await prisma.automationRule.upsert({
      where: { key: 'STAGE_QUALIFIED_MISSING_DOCS' },
      update: {},
      create: {
        key: 'STAGE_QUALIFIED_MISSING_DOCS',
        name: 'Collect Missing Documents (QUALIFIED Stage)',
        trigger: 'STAGE_CHANGE',
        isActive: true,
        enabled: true,
        conditions: JSON.stringify({
          toStage: 'QUALIFIED',
          missingMandatoryDocs: true,
        }),
        actions: JSON.stringify([
          {
            type: 'CREATE_TASK',
            title: 'Collect missing documents for {{lead.contact.fullName}}',
            taskType: 'DOCUMENT_REQUEST',
            dueAt: '+3 days', // 3 days from now
          },
          {
            type: 'SEND_AI_REPLY',
            channel: 'WHATSAPP',
            mode: 'DOCS',
            cooldownDays: 7, // Don't send again for 7 days
          },
        ]),
      },
    })
    console.log('✅ Created rule: Missing Docs (QUALIFIED)')

    // Rule 2: Document Expiry - 30 Days Warning
    const docExpiry30Rule = await prisma.automationRule.upsert({
      where: { key: 'DOC_EXPIRY_30_DAYS' },
      update: {},
      create: {
        key: 'DOC_EXPIRY_30_DAYS',
        name: 'Document Expiry Warning (30 Days)',
        trigger: 'EXPIRY_WINDOW',
        isActive: true,
        enabled: true,
        conditions: JSON.stringify({
          documentExpiryInDays: 30,
          documentTypes: ['EID', 'PASSPORT', 'COMPANY_LICENSE', 'EJARI'],
        }),
        actions: JSON.stringify([
          {
            type: 'CREATE_TASK',
            title: 'Document {{documentType}} expiring in 30 days',
            taskType: 'DOCUMENT_REQUEST',
            dueAt: '+7 days',
          },
          {
            type: 'SEND_AI_REPLY',
            channel: 'WHATSAPP',
            mode: 'DOCS',
            cooldownDays: 14, // Don't send again for 14 days
          },
        ]),
      },
    })
    console.log('✅ Created rule: Document Expiry (30 days)')

    // Rule 3: Document Expiry - 7 Days Urgent
    const docExpiry7Rule = await prisma.automationRule.upsert({
      where: { key: 'DOC_EXPIRY_7_DAYS' },
      update: {},
      create: {
        key: 'DOC_EXPIRY_7_DAYS',
        name: 'Document Expiry Urgent (7 Days)',
        trigger: 'EXPIRY_WINDOW',
        isActive: true,
        enabled: true,
        conditions: JSON.stringify({
          documentExpiryInDays: 7,
          documentTypes: ['EID', 'PASSPORT', 'COMPANY_LICENSE', 'EJARI'],
        }),
        actions: JSON.stringify([
          {
            type: 'CREATE_TASK',
            title: 'URGENT: Document {{documentType}} expiring in 7 days',
            taskType: 'DOCUMENT_REQUEST',
            priority: 'URGENT',
            dueAt: '+2 days',
          },
          {
            type: 'SEND_AI_REPLY',
            channel: 'WHATSAPP',
            mode: 'DOCS',
            cooldownDays: 3, // Can send again after 3 days if still expiring
          },
        ]),
      },
    })
    console.log('✅ Created rule: Document Expiry (7 days)')

    console.log('✅ Successfully seeded document automation rules!')
    console.log('   - Missing Docs (QUALIFIED stage)')
    console.log('   - Document Expiry Warning (30 days)')
    console.log('   - Document Expiry Urgent (7 days)')
  } catch (error) {
    console.error('❌ Error seeding document automation rules:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedDocumentAutomationRules()


