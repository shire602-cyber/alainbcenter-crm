import { prisma } from './prisma'

/**
 * Get expiry items expiring within a specified window (in days)
 */
export async function getExpiriesInWindow(days: number) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  
  const futureDate = new Date(today)
  futureDate.setUTCDate(futureDate.getUTCDate() + days)
  
  return await prisma.expiryItem.findMany({
    where: {
      expiryDate: {
        gte: today,
        lte: futureDate
      }
    },
    include: {
      contact: {
        select: { id: true, fullName: true, phone: true, email: true }
      },
      lead: {
        select: { id: true, stage: true, priority: true }
      },
      assignedUser: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: {
      expiryDate: 'asc'
    }
  })
}

/**
 * Get overdue expiry items
 */
export async function getOverdueExpiries() {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  
  return await prisma.expiryItem.findMany({
    where: {
      expiryDate: {
        lt: today
      }
    },
    include: {
      contact: {
        select: { id: true, fullName: true, phone: true, email: true }
      },
      lead: {
        select: { id: true, stage: true, priority: true }
      },
      assignedUser: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: {
      expiryDate: 'asc'
    }
  })
}

/**
 * Get the nearest expiry date for a contact or lead
 */
export async function getNearestExpiry(contactId?: number, leadId?: number) {
  const where: any = {}
  if (contactId) {
    where.contactId = contactId
  }
  if (leadId) {
    where.leadId = leadId
  }
  
  const nearest = await prisma.expiryItem.findFirst({
    where,
    orderBy: {
      expiryDate: 'asc'
    },
    select: {
      id: true,
      type: true,
      expiryDate: true
    }
  })
  
  return nearest
}
