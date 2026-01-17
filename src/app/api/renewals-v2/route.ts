import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { differenceInDays } from 'date-fns'
import { Prisma } from '@prisma/client'

/**
 * GET /api/renewals-v2
 * Fast paginated list endpoint for Renewal Command Center
 * Returns minimal list fields + summary KPIs
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()

    // Check if user is ADMIN or MANAGER
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      return NextResponse.json(
        { error: 'Unauthorized. Only ADMIN and MANAGER can access renewals.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Filters
    const serviceType = searchParams.get('serviceType')
    const status = searchParams.get('status')
    const assignedToUserId = searchParams.get('assignedToUserId')
    const notContacted = searchParams.get('notContacted') === 'true'
    const search = searchParams.get('search')
    const daysRemainingMin = searchParams.get('daysRemainingMin')
    const daysRemainingMax = searchParams.get('daysRemainingMax')

    // Build where clause
    const now = new Date()
    const whereClause: any = {}

    // Service type filter
    if (serviceType && serviceType !== 'all') {
      whereClause.serviceType = serviceType
    }

    // Status filter
    if (status && status !== 'all') {
      whereClause.status = status
    }

    // Assigned user filter
    if (assignedToUserId && assignedToUserId !== 'all') {
      whereClause.assignedToUserId = parseInt(assignedToUserId)
    }

    // Not contacted filter
    if (notContacted) {
      whereClause.lastContactedAt = null
    }

    // Days remaining filter (calculate from expiresAt)
    if (daysRemainingMin || daysRemainingMax) {
      const minDays = daysRemainingMin ? parseInt(daysRemainingMin) : -365
      const maxDays = daysRemainingMax ? parseInt(daysRemainingMax) : 365
      
      const minDate = new Date(now)
      minDate.setDate(minDate.getDate() + minDays)
      
      const maxDate = new Date(now)
      maxDate.setDate(maxDate.getDate() + maxDays)
      
      whereClause.expiresAt = {
        gte: minDate,
        lte: maxDate,
      }
    }

    // Search filter (name/phone) - use PostgreSQL ILIKE for case-insensitive search
    // Note: Store search filter separately and combine with existing whereClause
    const searchFilter = search ? {
      OR: [
        { lead: { contact: { fullName: { contains: search, mode: 'insensitive' as const } } } },
        { lead: { contact: { phone: { contains: search, mode: 'insensitive' as const } } } },
      ]
    } : {}
    
    // Combine all filters
    const finalWhereClause = {
      ...whereClause,
      ...searchFilter,
    }

    // Fetch renewal items with minimal joins
    const [items, total] = await Promise.all([
      prisma.renewalItem.findMany({
        where: finalWhereClause,
        select: {
          id: true,
          leadId: true,
          contactId: true,
          serviceType: true,
          serviceName: true,
          expiresAt: true,
          status: true,
          expectedValue: true,
          probability: true,
          assignedToUserId: true,
          lastContactedAt: true,
          nextActionAt: true,
          // Minimal lead data
          lead: {
            select: {
              id: true,
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                },
              },
              assignedUser: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          expiresAt: 'asc',
        },
        skip,
        take: limit,
      }),
      prisma.renewalItem.count({ where: finalWhereClause }),
    ])

    if (total === 0) {
      const now = new Date()
      const futureDate = new Date(now)
      futureDate.setDate(futureDate.getDate() + 180)
      const pastDate = new Date(now)
      pastDate.setDate(pastDate.getDate() - 120)

      const expiryItems = await prisma.expiryItem.findMany({
        where: {
          expiryDate: {
            gte: pastDate,
            lte: futureDate,
          },
        },
        select: {
          id: true,
          leadId: true,
          contactId: true,
          type: true,
          expiryDate: true,
          renewalStatus: true,
          assignedUserId: true,
          lastReminderSentAt: true,
          lead: {
            select: {
              id: true,
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  email: true,
                },
              },
              assignedUser: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          expiryDate: 'asc',
        },
        skip,
        take: limit,
      })

      const fallbackItems = expiryItems.map((item) => ({
        id: item.id,
        leadId: item.leadId,
        contactId: item.contactId,
        serviceType: item.type.replace(/_EXPIRY$/, ''),
        serviceName: item.type.replace(/_/g, ' '),
        expiresAt: item.expiryDate,
        status: item.renewalStatus,
        expectedValue: null,
        probability: null,
        assignedToUserId: item.assignedUserId,
        lastContactedAt: item.lastReminderSentAt,
        nextActionAt: null,
        lead: item.lead
          ? {
              id: item.lead.id,
              contact: item.lead.contact,
              assignedUser: item.lead.assignedUser,
            }
          : null,
        assignedTo: item.assignedUser,
      }))

      const totalFallback = await prisma.expiryItem.count({
        where: {
          expiryDate: {
            gte: pastDate,
            lte: futureDate,
          },
        },
      })

      return NextResponse.json({
        items: fallbackItems,
        pagination: {
          page,
          limit,
          total: totalFallback,
          totalPages: Math.ceil(totalFallback / limit),
        },
        summary: {
          revenueAtRisk30: 0,
          revenueAtRisk60: 0,
          revenueAtRisk90: 0,
          urgentCount: 0,
          expiredNotContacted: 0,
          recoveredThisMonth: 0,
        },
        fallback: true,
      })
    }

    // Calculate KPIs using PostgreSQL aggregation for better performance
    // Use raw SQL for efficient date calculations and aggregations
    const nowForKPIs = new Date()
    const thirtyDaysFromNow = new Date(nowForKPIs)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const sixtyDaysFromNow = new Date(nowForKPIs)
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60)
    const ninetyDaysFromNow = new Date(nowForKPIs)
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)
    const fourteenDaysFromNow = new Date(nowForKPIs)
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)
    const monthStart = new Date(nowForKPIs.getFullYear(), nowForKPIs.getMonth(), 1)

    // Calculate KPIs efficiently using Prisma aggregations where possible
    const [
      revenueAtRisk30Result,
      revenueAtRisk60Result,
      revenueAtRisk90Result,
      urgentCountResult,
      expiredNotContactedResult,
      recoveredThisMonthResult,
    ] = await Promise.all([
      // Revenue at risk (30 days) - using Prisma aggregation
      prisma.renewalItem.aggregate({
        where: {
          expiresAt: {
            gte: nowForKPIs,
            lte: thirtyDaysFromNow,
          },
          status: { not: 'RENEWED' },
        },
        _sum: {
          expectedValue: true,
        },
      }),
      // Revenue at risk (60 days)
      prisma.renewalItem.aggregate({
        where: {
          expiresAt: {
            gte: nowForKPIs,
            lte: sixtyDaysFromNow,
          },
          status: { not: 'RENEWED' },
        },
        _sum: {
          expectedValue: true,
        },
      }),
      // Revenue at risk (90 days)
      prisma.renewalItem.aggregate({
        where: {
          expiresAt: {
            gte: nowForKPIs,
            lte: ninetyDaysFromNow,
          },
          status: { not: 'RENEWED' },
        },
        _sum: {
          expectedValue: true,
        },
      }),
      // Urgent count (≤14 days)
      prisma.renewalItem.count({
        where: {
          expiresAt: {
            gte: nowForKPIs,
            lte: fourteenDaysFromNow,
          },
        },
      }),
      // Expired & not contacted
      prisma.renewalItem.count({
        where: {
          expiresAt: { lt: nowForKPIs },
          status: { not: 'RENEWED' },
          lastContactedAt: null,
        },
      }),
      // Recovered this month
      prisma.renewalItem.findMany({
        where: {
          status: 'RENEWED',
          updatedAt: { gte: monthStart },
        },
        select: {
          expectedValue: true,
          probability: true,
        },
      }),
    ])

    // Calculate revenue with probability (simplified - uses expectedValue as base)
    // For accuracy, would need to calculate (expectedValue * probability / 100) per item
    const revenueAtRisk30 = Math.round((revenueAtRisk30Result._sum.expectedValue || 0) * 0.7) // Assume 70% avg probability
    const revenueAtRisk60 = Math.round((revenueAtRisk60Result._sum.expectedValue || 0) * 0.7)
    const revenueAtRisk90 = Math.round((revenueAtRisk90Result._sum.expectedValue || 0) * 0.7)
    const urgentCount = urgentCountResult
    const expiredNotContacted = expiredNotContactedResult
    const recoveredThisMonth = recoveredThisMonthResult.reduce((sum, item) => {
      const revenue = item.expectedValue && item.probability
        ? Math.round((item.expectedValue * item.probability) / 100)
        : item.expectedValue || 0
      return sum + revenue
    }, 0)

    // Enrich items with computed fields
    const enrichedItems = items.map((item) => {
      const days = differenceInDays(item.expiresAt, now)
      const revenue = item.expectedValue && item.probability
        ? Math.round((item.expectedValue * item.probability) / 100)
        : null

      return {
        ...item,
        daysRemaining: days,
        projectedRevenue: revenue,
      }
    })

    return NextResponse.json({
      items: enrichedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        revenueAtRisk30,
        revenueAtRisk60,
        revenueAtRisk90,
        urgentCount,
        expiredNotContacted,
        recoveredThisMonth,
      },
    })
  } catch (error: any) {
    console.error('GET /api/renewals-v2 error:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json(
        {
          error: 'Renewals table missing',
          hint: 'Run Prisma migrations to create RenewalItem and RenewalEventLog tables.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch renewals' },
      { status: 500 }
    )
  }
}

