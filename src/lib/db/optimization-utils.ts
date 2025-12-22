/**
 * Database Optimization Utilities
 * Helper functions for optimized database queries
 */

import { prisma } from '@/lib/prisma'

/**
 * Get lead counts by stage (optimized database aggregation)
 */
export async function getLeadCountsByStage() {
  try {
    const counts = await prisma.lead.groupBy({
      by: ['stage'],
      _count: {
        id: true,
      },
    })
    return new Map(counts.map((c) => [c.stage, c._count.id]))
  } catch (error) {
    console.error('Error getting lead counts by stage:', error)
    return new Map<string, number>()
  }
}

/**
 * Get recent leads count (database-level filtering)
 */
export async function getRecentLeadsCount(days: number = 30) {
  try {
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - days)
    
    return await prisma.lead.count({
      where: {
        createdAt: {
          gte: dateThreshold,
        },
      },
    })
  } catch (error) {
    console.error('Error getting recent leads count:', error)
    return 0
  }
}

/**
 * Batch fetch with pagination support
 */
export async function batchFetchLeads(
  where: any,
  page: number = 1,
  limit: number = 50,
  select?: any
) {
  const skip = (page - 1) * limit
  
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      select: select || {
        id: true,
        stage: true,
        createdAt: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ])
  
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

