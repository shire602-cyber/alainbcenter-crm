// Simple test endpoint to verify browser accepts cookies
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const response = NextResponse.json({ 
    message: 'Cookie test',
    existingCookies: req.cookies.getAll().map(c => c.name)
  })
  
  // Try setting a simple test cookie (non-httpOnly so we can see it in JS)
  response.cookies.set('test_cookie_visible', 'test_value_123', {
    httpOnly: false, // Visible in document.cookie for testing
    secure: false,
    sameSite: 'lax',
    maxAge: 60,
    path: '/',
  })
  
  // Also set an httpOnly cookie like our session
  response.cookies.set('test_cookie_httpOnly', 'httpOnly_value_456', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60,
    path: '/',
  })
  
  return response
}

