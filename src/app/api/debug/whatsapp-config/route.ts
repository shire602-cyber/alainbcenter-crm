import { NextResponse } from 'next/server'
import { checkWhatsAppConfiguration } from '@/lib/whatsapp'

/**
 * GET /api/debug/whatsapp-config
 * 
 * Safe debug endpoint to check WhatsApp configuration status
 * Returns configuration status without exposing sensitive data
 */
export async function GET() {
  try {
    const config = await checkWhatsAppConfiguration()
    
    // Get Graph API version from constants
    const WHATSAPP_API_VERSION = 'v21.0'
    
    // Get app URL host (for reference)
    const appUrlHost = process.env.NEXT_PUBLIC_APP_URL 
      || process.env.VERCEL_URL 
      || process.env.NODE_ENV === 'production' 
        ? 'production' 
        : 'localhost'
    
    return NextResponse.json({
      hasWhatsAppToken: config.tokenPresent,
      hasPhoneNumberId: config.phoneNumberIdPresent,
      hasWabaId: !!process.env.WHATSAPP_WABA_ID || !!process.env.META_WABA_ID,
      graphVersion: WHATSAPP_API_VERSION,
      appUrlHost,
      now: new Date().toISOString(),
      tokenSource: config.tokenSource,
    })
  } catch (error: any) {
    return NextResponse.json({
      hasWhatsAppToken: false,
      hasPhoneNumberId: false,
      hasWabaId: false,
      graphVersion: 'v21.0',
      appUrlHost: 'unknown',
      now: new Date().toISOString(),
      tokenSource: 'none',
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}

