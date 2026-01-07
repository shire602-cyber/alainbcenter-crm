import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/leads/export
 * Admin-only CSV export endpoint
 * Supports query params for filtering (same as GET /api/leads)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const { searchParams } = new URL(req.url)
    const selectedIds = searchParams.get('ids') // Comma-separated lead IDs (optional)

    // Build where clause (reuse same logic as GET /api/leads)
    const query = searchParams.get('query')
    const pipelineStage = searchParams.get('pipelineStage')
    const source = searchParams.get('source')
    const serviceTypeId = searchParams.get('serviceTypeId')
    const assignedToUserId = searchParams.get('assignedToUserId')
    const createdAtFrom = searchParams.get('createdAtFrom')
    const createdAtTo = searchParams.get('createdAtTo')
    const aiScoreCategory = searchParams.get('aiScoreCategory')

    let whereClause: any = {}

    // If specific IDs provided, filter by those
    if (selectedIds) {
      const ids = selectedIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      whereClause.id = { in: ids }
    } else {
      // Otherwise apply filters
      const andConditions: any[] = []

      if (query) {
        andConditions.push({
          OR: [
            {
              contact: {
                fullName: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            },
            {
              contact: {
                phone: { contains: query },
              },
            },
            {
              contact: {
                email: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            },
          ],
        })
      }

      if (pipelineStage) {
        andConditions.push({ pipelineStage })
      }

      if (source) {
        andConditions.push({
          contact: { source },
        })
      }

      if (serviceTypeId) {
        const id = parseInt(serviceTypeId)
        if (!isNaN(id)) {
          andConditions.push({ serviceTypeId: id })
        }
      }

      if (assignedToUserId) {
        const id = parseInt(assignedToUserId)
        if (!isNaN(id)) {
          andConditions.push({ assignedUserId: id })
        }
      }

      if (createdAtFrom || createdAtTo) {
        const dateFilter: any = {}
        if (createdAtFrom) {
          const from = new Date(createdAtFrom)
          from.setUTCHours(0, 0, 0, 0)
          dateFilter.gte = from
        }
        if (createdAtTo) {
          const to = new Date(createdAtTo)
          to.setUTCHours(23, 59, 59, 999)
          dateFilter.lte = to
        }
        if (Object.keys(dateFilter).length > 0) {
          andConditions.push({ createdAt: dateFilter })
        }
      }

      if (aiScoreCategory === 'hot') {
        andConditions.push({ aiScore: { gte: 75 } })
      } else if (aiScoreCategory === 'warm') {
        andConditions.push({ aiScore: { gte: 40, lt: 75 } })
      } else if (aiScoreCategory === 'cold') {
        andConditions.push({
          OR: [
            { aiScore: { lt: 40 } },
            { aiScore: { equals: null } },
          ],
        })
      }

      if (andConditions.length > 0) {
        whereClause = { AND: andConditions }
      }
    }

    // Fetch all matching leads (no pagination for export)
    const leads = await prisma.lead.findMany({
      where: whereClause,
      select: {
        id: true,
        pipelineStage: true,
        aiScore: true,
        createdAt: true,
        contact: {
          select: {
            fullName: true,
            phone: true,
            email: true,
            nationality: true,
            source: true,
          },
        },
        assignedUser: {
          select: { name: true, email: true },
        },
        serviceType: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Build CSV
    const headers = [
      'ID',
      'Name',
      'Phone',
      'Email',
      'Nationality',
      'Stage',
      'Service',
      'Source',
      'AI Score',
      'Assigned To',
      'Created At',
    ]

    const rows = leads.map(lead => [
      lead.id.toString(),
      lead.contact.fullName || '',
      lead.contact.phone || '',
      lead.contact.email || '',
      lead.contact.nationality || '',
      lead.pipelineStage || '',
      lead.serviceType?.name || '',
      lead.contact.source || '',
      lead.aiScore?.toString() || '',
      lead.assignedUser?.name || '',
      lead.createdAt.toISOString(),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    console.error('GET /api/leads/export error:', error)
    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: error?.message ?? 'Failed to export leads' },
      { status: 500 }
    )
  }
}

