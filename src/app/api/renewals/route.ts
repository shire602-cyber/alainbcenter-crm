import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { differenceInDays } from 'date-fns'

/**
 * GET /api/renewals
 * Get all expiry items with renewal data for dashboard
 * Auth: ADMIN or MANAGER only
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

    // Fetch all expiry items with optimized selects
    const expiryItems = await prisma.expiryItem.findMany({
      select: {
        id: true,
        type: true,
        expiryDate: true,
        renewalStatus: true,
        lastReminderSentAt: true,
        reminderCount: true,
        assignedUserId: true,
        leadId: true,
        contactId: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        lead: {
          select: {
            id: true,
            estimatedRenewalValue: true,
            renewalProbability: true,
            stage: true,
            assignedUserId: true,
            assignedUser: {
              select: { id: true, name: true, email: true },
            },
            contact: {
              select: { id: true, fullName: true, phone: true },
            },
          },
        },
        contact: {
          select: { id: true, fullName: true, phone: true },
        },
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: {
        expiryDate: 'asc',
      },
    })

    // Calculate KPIs directly from fetched data (avoid duplicate query)
    const now = new Date()
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    
    let expiring90Days = 0
    let expiring30Days = 0
    let expiredNotRenewed = 0
    let projectedRevenue = 0
    let renewed = 0
    let pending = 0

    expiryItems.forEach((item) => {
      const days = differenceInDays(item.expiryDate, now)
      
      if (days <= 90 && days > 0) {
        expiring90Days++
      }
      if (days <= 30 && days > 0) {
        expiring30Days++
      }
      if (days < 0 && item.renewalStatus !== 'RENEWED') {
        expiredNotRenewed++
      }
      if (item.renewalStatus === 'RENEWED') {
        renewed++
      }
      if (item.renewalStatus === 'PENDING') {
        pending++
      }

      // Calculate projected revenue
      if (item.lead && item.lead.estimatedRenewalValue && item.lead.renewalProbability) {
        const value = parseFloat(item.lead.estimatedRenewalValue) || 0
        const probability = item.lead.renewalProbability || 0
        projectedRevenue += (value * probability) / 100
      }
    })

    const total = renewed + pending
    const renewalConversionRate = total > 0 ? (renewed / total) * 100 : 0

    const stats = {
      expiring90Days,
      expiring30Days,
      expiredNotRenewed,
      projectedRevenue: Math.round(projectedRevenue),
      renewalConversionRate,
    }

    // Calculate per-item stats for the table
    const enrichedItems = expiryItems.map((item) => {
      const days = differenceInDays(item.expiryDate, now)
      const lead = item.lead
      const estimatedValue = lead?.estimatedRenewalValue ? parseFloat(lead.estimatedRenewalValue) : null
      const probability = lead?.renewalProbability ?? 0
      const projectedRevenue = estimatedValue ? Math.round((estimatedValue * probability) / 100) : null

      return {
        ...item,
        daysRemaining: days,
        estimatedRenewalValue: lead?.estimatedRenewalValue,
        renewalProbability: lead?.renewalProbability,
        projectedRevenue,
      }
    })

    return NextResponse.json({
      expiryItems: enrichedItems,
      kpis: {
        ...stats,
        expiring90Days: stats.expiring90Days,
        expiring30Days: stats.expiring30Days,
        expiredNotRenewed: stats.expiredNotRenewed,
        renewalConversionRate: stats.renewalConversionRate,
        projectedRevenue: stats.projectedRevenue,
      },
    })
  } catch (error: any) {
    console.error('GET /api/renewals error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch renewals' },
      { status: 500 }
    )
  }
}

















