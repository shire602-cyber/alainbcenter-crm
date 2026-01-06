import { NextResponse } from 'next/server'
import { checkWhatsAppConfiguration } from '@/lib/whatsapp'

/**
 * GET /api/debug/whatsapp-config
 * 
 * Safe debug endpoint to check WhatsApp configuration status
 * Returns configuration status without exposing sensitive data
 * Also includes Neon/Vercel database environment variable checks
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
    
    // Check Neon/Vercel database environment variables (booleans only, never print secrets)
    const hasDatabaseUrl = !!process.env.DATABASE_URL
    const hasDirectUrl = !!process.env.DIRECT_URL
    const databaseUrlIsNeon = hasDatabaseUrl && (
      process.env.DATABASE_URL?.includes('neon.tech') ||
      process.env.DATABASE_URL?.includes('neon') ||
      process.env.DATABASE_URL?.includes('pooler')
    )
    const databaseUrlIsPooler = hasDatabaseUrl && (
      process.env.DATABASE_URL?.includes('pooler') ||
      process.env.DATABASE_URL?.includes('-pooler.')
    )
    
    return NextResponse.json({
      // WhatsApp config
      hasWhatsAppToken: config.tokenPresent,
      hasPhoneNumberId: config.phoneNumberIdPresent,
      hasWabaId: !!process.env.WHATSAPP_WABA_ID || !!process.env.META_WABA_ID,
      graphVersion: WHATSAPP_API_VERSION,
      appUrlHost,
      tokenSource: config.tokenSource,
      // Neon/Vercel database config (booleans only)
      hasDatabaseUrl,
      hasDirectUrl,
      databaseUrlIsNeon,
      databaseUrlIsPooler,
      // Timestamp
      now: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      hasWhatsAppToken: false,
      hasPhoneNumberId: false,
      hasWabaId: false,
      graphVersion: 'v21.0',
      appUrlHost: 'unknown',
      tokenSource: 'none',
      hasDatabaseUrl: false,
      hasDirectUrl: false,
      databaseUrlIsNeon: false,
      databaseUrlIsPooler: false,
      now: new Date().toISOString(),
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}

