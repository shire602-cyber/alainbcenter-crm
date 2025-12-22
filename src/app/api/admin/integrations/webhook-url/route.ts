import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { getWebhookUrl } from '@/lib/publicUrl'

// GET /api/admin/integrations/webhook-url
// Returns the public webhook URL for WhatsApp
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()
    
    const webhookUrl = getWebhookUrl('/api/webhooks/whatsapp', req)
    
    return NextResponse.json({ webhookUrl })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get webhook URL' },
      { status: error.statusCode || 500 }
    )
  }
}






















