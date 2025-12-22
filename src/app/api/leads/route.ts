import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ingestLead } from '@/lib/leadIngest'

// GET /api/leads  -> return all leads with contact info and last communication
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') // 'all', 'followups_today', 'expiring_90', 'overdue', 'hot_only'
    const pipelineStage = searchParams.get('pipelineStage') // Filter by pipeline stage
    const source = searchParams.get('source') // Filter by source
    const aiScoreCategory = searchParams.get('aiScoreCategory') // 'hot', 'warm', 'cold'
   
    // Advanced search parameters
    const searchName = searchParams.get('searchName')
    const searchPhone = searchParams.get('searchPhone')
    const searchEmail = searchParams.get('searchEmail')
    const searchNationality = searchParams.get('searchNationality')
    const searchCompany = searchParams.get('searchCompany')
    const searchExpiryDateFrom = searchParams.get('searchExpiryDateFrom')
    const searchExpiryDateTo = searchParams.get('searchExpiryDateTo')
    const searchCreatedFrom = searchParams.get('searchCreatedFrom')
    const searchCreatedTo = searchParams.get('searchCreatedTo')
    // Normalize today to UTC midnight to match automation endpoints and avoid timezone issues
    // This ensures UI filter displays match automation logic regardless of server timezone
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Build where clause based on filter
    // Use AND array structure to properly compose filters with OR conditions
    let andConditions: any[] = []
    let orCondition: any = null

    // Date-based filters
    if (filter === 'followups_today') {
      const tomorrow = new Date(today)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      andConditions.push({
        nextFollowUpAt: {
          gte: today,
          lt: tomorrow,
        },
      })
    } else if (filter === 'expiring_90') {
      const days90 = new Date(today)
      days90.setUTCDate(days90.getUTCDate() + 90)
      andConditions.push({
        expiryDate: {
          gte: today,
          lte: days90,
        },
      })
    } else if (filter === 'overdue') {
      andConditions.push({
        expiryDate: {
          lt: today,
        },
      })
    }
    // Note: hot_only filter handled by aiScoreCategory below if not set explicitly

    // Additional filters
    if (pipelineStage) {
      andConditions.push({ pipelineStage })
    }

    if (source) {
      andConditions.push({
        contact: {
          source: source,
        },
      })
    }
       
    // Advanced search filters
    if (searchName) {
      andConditions.push({
        contact: {
          fullName: {
            contains: searchName,
            mode: 'insensitive',
          },
        },
      })
    }

    if (searchPhone) {
      andConditions.push({
        contact: {
          phone: {
            contains: searchPhone,
          },
        },
      })
    }

    if (searchEmail) {
      andConditions.push({
        contact: {
          email: {
            contains: searchEmail,
            mode: 'insensitive',
          },
        },
      })
    }

    if (searchNationality) {
      andConditions.push({
        contact: {
          nationality: {
            contains: searchNationality,
            mode: 'insensitive',
          },
        },
      })
    }

    if (searchCompany) {
      andConditions.push({
        notes: {
          contains: searchCompany,
          mode: 'insensitive',
        },
      })
    }

    if (searchExpiryDateFrom || searchExpiryDateTo) {
      const expiryFilter: any = {}
      if (searchExpiryDateFrom) {
        const fromDate = new Date(searchExpiryDateFrom)
        fromDate.setUTCHours(0, 0, 0, 0)
        expiryFilter.gte = fromDate
      }
      if (searchExpiryDateTo) {
        const toDate = new Date(searchExpiryDateTo)
        toDate.setUTCHours(23, 59, 59, 999)
        expiryFilter.lte = toDate
      }
      if (Object.keys(expiryFilter).length > 0) {
        andConditions.push({
          expiryDate: expiryFilter,
        })
      }
    }

    if (searchCreatedFrom || searchCreatedTo) {
      const createdFilter: any = {}
      if (searchCreatedFrom) {
        const fromDate = new Date(searchCreatedFrom)
        fromDate.setUTCHours(0, 0, 0, 0)
        createdFilter.gte = fromDate
      }
      if (searchCreatedTo) {
        const toDate = new Date(searchCreatedTo)
        toDate.setUTCHours(23, 59, 59, 999)
        createdFilter.lte = toDate
      }
      if (Object.keys(createdFilter).length > 0) {
        andConditions.push({
          createdAt: createdFilter,
        })
      }
    }

    // AI Score filtering (takes precedence over hot_only quick filter)
    if (aiScoreCategory === 'hot' || filter === 'hot_only') {
      andConditions.push({
        aiScore: {
          gte: 70,
        },
      })
    } else if (aiScoreCategory === 'warm') {
      andConditions.push({
        aiScore: { gte: 40, lt: 70 },
      })
    } else if (aiScoreCategory === 'cold') {
      // For cold filter, we need OR condition (aiScore < 40 OR aiScore IS NULL)
      // This must be part of the AND conditions array to properly compose with other filters
      orCondition = {
        OR: [
          { aiScore: { lt: 40 } },
          { aiScore: { equals: null } },
        ],
      }
    }

    // Build final where clause
    // If we have OR condition and other AND conditions, wrap everything properly
    let whereClause: any
    if (orCondition && andConditions.length > 0) {
      // All conditions must be ANDed together, with OR nested within
      whereClause = {
        AND: [
          ...andConditions,
          orCondition,
        ],
      }
    } else if (orCondition) {
      // Only OR condition, no other filters
      whereClause = orCondition
    } else if (andConditions.length > 0) {
      // Only AND conditions
      whereClause = {
        AND: andConditions,
      }
    } else {
      // No filters
      whereClause = {}
    }

    // Pagination support
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Optimized: Use select to only fetch needed fields, limit nested data
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
      where: whereClause,
      select: {
        id: true,
        leadType: true,
        status: true,
        pipelineStage: true,
        stage: true,
        aiScore: true,
        expiryDate: true,
        nextFollowUpAt: true,
        assignedUserId: true,
        createdAt: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            source: true,
          }
        },
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
          // Only get latest communication log (optimized)
        communicationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            channel: true,
            direction: true,
            createdAt: true,
          }
        },
          // Only get nearest 3 expiry items (optimized)
        expiryItems: {
          orderBy: { expiryDate: 'asc' },
          take: 3,
          select: {
            id: true,
            type: true,
            expiryDate: true,
            renewalStatus: true,
          }
        },
        renewalProbability: true,
        estimatedRenewalValue: true,
      },
      orderBy: { createdAt: 'desc' },
        skip,
        take: Math.min(limit, 100), // Max 100 per page
      }),
      // Count query runs in parallel
      prisma.lead.count({ where: whereClause })
    ])

    // Transform to include lastContact
    const leadsWithLastContact = leads.map((lead: any) => ({
      ...lead,
      lastContact: lead.communicationLogs?.[0] || null,
    }))

    return NextResponse.json({
      leads: leadsWithLastContact,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error: any) {
    console.error('GET /api/leads error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in GET /api/leads' },
      { status: 500 }
    )
  }
}

// POST /api/leads  -> create contact + lead
export async function POST(req: NextRequest) {
  try {
    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    if (!body.fullName || !body.phone) {
      return NextResponse.json(
        { error: 'Missing fullName or phone' },
        { status: 400 }
      )
    }

    // Normalize source - map variations to allowed values (same as /ingest endpoint)
    const sourceMap: Record<string, 'website' | 'facebook_ad' | 'instagram_ad' | 'whatsapp' | 'manual'> = {
      'website': 'website',
      'web': 'website',
      'facebook_ad': 'facebook_ad',
      'facebook_ads': 'facebook_ad',
      'facebook': 'facebook_ad',
      'instagram_ad': 'instagram_ad',
      'instagram_ads': 'instagram_ad',
      'instagram': 'instagram_ad',
      'whatsapp': 'whatsapp',
      'wa': 'whatsapp',
      'manual': 'manual',
      'renewal': 'manual', // Map renewal to manual
    }
    const source = sourceMap[body.source?.toLowerCase()] || 'manual'

    // Use shared ingest function (reuses same logic as /ingest endpoint)
    const result = await ingestLead({
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      service: body.service,
      leadType: body.leadType,
      serviceTypeId: body.serviceTypeId ? parseInt(body.serviceTypeId) : undefined,
      serviceTypeEnum: body.serviceTypeEnum,
      source: source as any,
      notes: body.notes,
      expiryDate: body.expiryDate,
      nextFollowUpAt: body.nextFollowUpAt,
      nationality: body.nationality,
      isRenewal: body.isRenewal || false,
      originalExpiryItemId: body.originalExpiryItemId ? parseInt(body.originalExpiryItemId) : undefined,
      estimatedValue: body.estimatedValue,
    })

    return NextResponse.json(result.lead, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads error:', error)
    // Return 400 for validation errors (invalid dates), 500 for other errors
    const status = error.message?.includes('Invalid date format') ? 400 : 500
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in POST /api/leads' },
      { status }
    )
  }
}
