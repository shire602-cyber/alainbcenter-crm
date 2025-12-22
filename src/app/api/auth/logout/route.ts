import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    
    // Clear session cookie
    cookieStore.delete('alaincrm_session')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Logout failed' },
      { status: 500 }
    )
  }
}

