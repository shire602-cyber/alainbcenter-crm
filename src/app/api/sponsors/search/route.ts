import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()
    
    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get('q') || ''

    if (query.length < 2) {
      return NextResponse.json({ sponsors: [] })
    }

    // Search in Contact.localSponsorName
    const contacts = await prisma.contact.findMany({
      where: {
        localSponsorName: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        localSponsorName: true,
        createdAt: true,
      },
      distinct: ['localSponsorName'],
      take: 20,
    })

    // Count occurrences by grouping
    const sponsorMap = new Map<string, { count: number; lastUsedAt: Date }>()
    
    for (const contact of contacts) {
      if (contact.localSponsorName) {
        const existing = sponsorMap.get(contact.localSponsorName)
        sponsorMap.set(contact.localSponsorName, {
          count: (existing?.count || 0) + 1,
          lastUsedAt: existing?.lastUsedAt && existing.lastUsedAt > contact.createdAt 
            ? existing.lastUsedAt 
            : contact.createdAt,
        })
      }
    }

    // Convert to array and sort by count
    const sponsors = Array.from(sponsorMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        lastUsedAt: data.lastUsedAt.toISOString(),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return NextResponse.json({ sponsors })
  } catch (error: any) {
    console.error('Failed to search sponsors:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search sponsors' },
      { status: 500 }
    )
  }
}

