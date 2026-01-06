import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/debug/prisma
 * 
 * Lightweight debug endpoint to test Prisma connectivity
 * Does a simple count query (no writes, no providerMediaId)
 */
export async function GET() {
  try {
    const messageCount = await prisma.message.count()
    
    return NextResponse.json({
      ok: true,
      messageCount,
      now: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Unknown error',
      errorCode: error.code || null,
      now: new Date().toISOString(),
    }, { status: 500 })
  }
}

