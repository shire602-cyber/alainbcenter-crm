// Debug endpoint to check what cookies are present
// D) LOCK DOWN: Only available in development
import { NextRequest, NextResponse } from 'next/server'
import { decodeSessionToken } from '@/lib/auth-session'

export async function GET(req: NextRequest) {
  // Lock down in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    )
  }
  const cookie = req.cookies.get('alaincrm_session')
  const allCookies = req.cookies.getAll()
  
  let decoded = null
  let decodeError = null
  if (cookie?.value) {
    try {
      decoded = await decodeSessionToken(cookie.value)
      if (!decoded) {
        decodeError = 'decodeSessionToken returned null'
      }
    } catch (e: any) {
      decodeError = e.message
    }
  }

  return NextResponse.json({
    hasCookie: !!cookie,
    cookieValue: cookie?.value ? cookie.value.substring(0, 80) + '...' : null,
    cookieValueLength: cookie?.value?.length || 0,
    cookieValueEndsWith: cookie?.value ? cookie.value.substring(cookie.value.length - 30) : null,
    decodedToken: decoded ? {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
    } : null,
    decodeError,
    allCookies: allCookies.map(c => ({ 
      name: c.name, 
      valueLength: c.value?.length || 0,
      valuePreview: c.value?.substring(0, 30) + '...' || 'empty'
    })),
  }, { status: 200 })
}

