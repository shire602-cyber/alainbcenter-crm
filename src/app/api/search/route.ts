import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get('q')?.trim()

    if (!query) {
      return NextResponse.json({ conversations: [], leads: [], contacts: [] })
    }

    const [conversations, leads, contacts] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          OR: [
            {
              messages: {
                some: {
                  body: {
                    contains: query,
                    mode: 'insensitive',
                  },
                },
              },
            },
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
                phone: {
                  contains: query,
                },
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
            {
              contact: {
                nationality: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
        select: {
          id: true,
          channel: true,
          lastMessageAt: true,
          contact: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              body: true,
              createdAt: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 20,
      }),
      prisma.lead.findMany({
        where: {
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
                phone: {
                  contains: query,
                },
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
            {
              contact: {
                nationality: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
        select: {
          id: true,
          pipelineStage: true,
          status: true,
          createdAt: true,
          contact: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              nationality: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.contact.findMany({
        where: {
          OR: [
            {
              fullName: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              phone: {
                contains: query,
              },
            },
            {
              email: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              nationality: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return NextResponse.json({
      conversations,
      leads,
      contacts,
    })
  } catch (error: any) {
    console.error('[SEARCH] Failed to run unified search', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to search' },
      { status: 500 }
    )
  }
}
