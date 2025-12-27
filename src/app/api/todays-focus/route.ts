/**
 * TODAY'S FOCUS API
 * 
 * GET /api/todays-focus
 * Returns all focus items for today (replies overdue, quotes due, follow-ups, renewals, HOT leads)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTodaysFocus } from '@/lib/todaysFocus'
import { requireAuthApi } from '@/lib/authApi'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    
    // Get focus items (optionally filtered by user)
    const focusItems = await getTodaysFocus(user.id)

    return NextResponse.json({
      items: focusItems,
      count: focusItems.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('GET /api/todays-focus error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch focus items' },
      { status: 500 }
    )
  }
}

