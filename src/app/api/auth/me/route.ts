import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserApi } from '@/lib/authApi'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserApi()
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 })
    }
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ user: null }, { status: 401 })
  }
}

