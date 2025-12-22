/**
 * Phone number normalization for inbound WhatsApp messages
 * Meta sends phone numbers without + prefix, we need to normalize them
 */

/**
 * Normalize phone number from inbound WhatsApp webhook
 * Meta sends phone as "971501234567" (no + prefix)
 * Converts to E.164: "+971501234567"
 */
export function normalizeInboundPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number is required and must be a string')
  }

  let cleaned = phone.replace(/[^\d]/g, '')

  cleaned = cleaned.replace(/^0+/, '')

  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return '+' + cleaned
  }

  if (cleaned.length === 9 && cleaned.startsWith('5')) {
    return '+971' + cleaned
  }

  if (cleaned.length === 10 && cleaned.startsWith('05')) {
    return '+971' + cleaned.substring(1)
  }

  if (cleaned.length >= 8 && cleaned.length <= 10) {
    return '+971' + cleaned
  }

  throw new Error(
    `Unable to normalize inbound phone number "${phone}". ` +
    `Expected format: E.164 without + prefix (e.g., 971501234567)`
  )
}

/**
 * Find contact by phone number (flexible matching)
 * Tries multiple formats to find existing contact
 */
export async function findContactByPhone(prisma: any, phone: string): Promise<any | null> {
  let contact = await prisma.contact.findFirst({
    where: { phone },
    include: {
      leads: {
        where: {
          pipelineStage: { notIn: ['completed', 'lost'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (contact) return contact

  const phoneWithoutPlus = phone.replace(/^\+/, '')
  contact = await prisma.contact.findFirst({
    where: { phone: phoneWithoutPlus },
    include: {
      leads: {
        where: {
          pipelineStage: { notIn: ['completed', 'lost'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (contact) return contact

  const phoneWithPlus = phone.startsWith('+') ? phone : '+' + phone
  contact = await prisma.contact.findFirst({
    where: { phone: phoneWithPlus },
    include: {
      leads: {
        where: {
          pipelineStage: { notIn: ['completed', 'lost'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (contact) return contact

  if (phoneWithoutPlus.length >= 9) {
    const lastDigits = phoneWithoutPlus.slice(-9)
    contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: { endsWith: lastDigits } },
          { phone: { contains: lastDigits } },
        ],
      },
      include: {
        leads: {
          where: {
            pipelineStage: { notIn: ['completed', 'lost'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
  }

  return contact
}











