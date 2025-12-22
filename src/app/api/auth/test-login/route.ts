// Test endpoint to verify cookie setting works
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const response = NextResponse.json({ 
    message: 'Test cookie set',
    cookies: req.cookies.getAll().map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' }))
  })
  
  // Try to set a test cookie
  response.cookies.set('test_cookie', 'test_value_123', {
    httpOnly: false, // Make it visible for testing
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  
  return response
}

