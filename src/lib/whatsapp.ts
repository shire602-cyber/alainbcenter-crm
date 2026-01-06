/**
 * WhatsApp Cloud API client wrapper
 * Server-side only - never expose tokens to browser
 */

import { normalizeToE164 } from './phone'
import { prisma } from './prisma'

const WHATSAPP_API_VERSION = 'v21.0'

interface WhatsAppResponse {
  messaging_product: string
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string; pacing?: string }> // TASK 5: Include pacing status
}

interface WhatsAppError {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

/**
 * Shared helper: Get WhatsApp access token from database or environment
 * Single source of truth for token retrieval
 * @returns Access token or null
 */
export async function getWhatsAppAccessTokenInternal(): Promise<string | null> {
  // Try database first (Integration model)
  try {
    const integration = await prisma.integration.findUnique({
      where: { name: 'whatsapp' },
    })

    if (integration) {
      // Get from config JSON (canonical location)
      if (integration.config) {
        try {
          const config = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
          
          // Canonical key: config.accessToken
          // Legacy keys supported: integration.accessToken, integration.apiKey
          const token = config.accessToken || integration.accessToken || integration.apiKey || null
          
          if (token) {
            return token
          }
        } catch (e) {
          console.warn('[WHATSAPP-CREDENTIALS] Failed to parse integration config:', e)
        }
      } else {
        // Fallback to direct fields (legacy)
        const token = integration.accessToken || integration.apiKey || null
        if (token) {
          return token
        }
      }
    }
  } catch (e) {
    console.warn('[WHATSAPP-CREDENTIALS] Could not fetch integration from DB:', e)
  }

  // Fallback to environment variables
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || null
  if (envToken) {
    return envToken
  }

  return null
}

/**
 * Configuration self-check helper
 * @returns Configuration status without exposing sensitive data
 */
export async function checkWhatsAppConfiguration(): Promise<{
  tokenPresent: boolean
  tokenSource: 'env' | 'db' | 'none'
  phoneNumberIdPresent: boolean
}> {
  let tokenPresent = false
  let tokenSource: 'env' | 'db' | 'none' = 'none'
  let phoneNumberIdPresent = false

  // Check database first
  try {
    const integration = await prisma.integration.findUnique({
      where: { name: 'whatsapp' },
      select: {
        config: true,
        accessToken: true,
        apiKey: true,
      },
    })

    if (integration) {
      let hasTokenInConfig = false
      if (integration.config) {
        try {
          const config = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
          
          if (config.accessToken || config.phoneNumberId) {
            hasTokenInConfig = !!config.accessToken
            phoneNumberIdPresent = !!config.phoneNumberId
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      if (hasTokenInConfig || integration.accessToken || integration.apiKey) {
        tokenPresent = true
        tokenSource = 'db'
      }

      // Also check phoneNumberId from config if we haven't found it yet
      if (!phoneNumberIdPresent && integration.config) {
        try {
          const config = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
          phoneNumberIdPresent = !!config.phoneNumberId
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  } catch (e) {
    // Ignore DB errors, fall back to env check
  }

  // Check environment variables if not found in DB
  if (!tokenPresent) {
    const envToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
    if (envToken) {
      tokenPresent = true
      tokenSource = 'env'
    }
    const envPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (envPhoneNumberId) {
      phoneNumberIdPresent = true
    }
  }

  return {
    tokenPresent,
    tokenSource,
    phoneNumberIdPresent,
  }
}

/**
 * Helper function to pick first non-empty value
 */
function pickFirst(...vals: Array<string | undefined | null>): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return undefined
}

/**
 * Unified WhatsApp credentials function
 * DB-first: Reads from Integration table (Integrations page), falls back to env vars
 * Single source of truth for both upload/sending and media proxy
 * @returns { accessToken, phoneNumberId, wabaId?, tokenSource }
 * where tokenSource is 'env' | 'db'
 */
export async function getWhatsAppCredentials(): Promise<{
  accessToken: string
  phoneNumberId: string
  wabaId?: string
  tokenSource: 'env' | 'db'
}> {
  let accessToken: string | undefined = undefined
  let phoneNumberId: string | undefined = undefined
  let wabaId: string | undefined = undefined
  let tokenSource: 'env' | 'db' = 'db'

  // 1) DB-first: read from Integrations config (your UI stores it here)
  try {
    // Try provider + isEnabled first (new way)
    let integration = await prisma.integration.findFirst({
      where: { provider: 'whatsapp', isEnabled: true },
      select: {
        config: true,
        accessToken: true,
        apiKey: true,
      },
    })

    // Fallback to name='whatsapp' (legacy)
    if (!integration) {
      integration = await prisma.integration.findUnique({
        where: { name: 'whatsapp' },
        select: {
          config: true,
          accessToken: true,
          apiKey: true,
        },
      })
    }

    if (integration) {
      // Parse config JSON (canonical location)
      let cfg: Record<string, any> = {}
      if (integration.config) {
        try {
          cfg = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
        } catch (e) {
          console.warn('[WHATSAPP-CREDENTIALS] Failed to parse integration config:', e)
        }
      }

      // Get credentials from config (multiple key variations supported)
      accessToken = pickFirst(
        cfg.accessToken,
        cfg.whatsappAccessToken,
        cfg.metaAccessToken,
        integration.accessToken,
        integration.apiKey
      )

      phoneNumberId = pickFirst(
        cfg.phoneNumberId,
        cfg.whatsappPhoneNumberId,
        cfg.phone_number_id
      )

      wabaId = pickFirst(
        cfg.wabaId,
        cfg.whatsappWabaId,
        cfg.whatsappBusinessAccountId,
        cfg.waba_id,
        cfg.businessAccountId
      )

      if (accessToken) {
        tokenSource = 'db'
      }
    }
  } catch (e) {
    console.warn('[WHATSAPP-CREDENTIALS] Could not fetch integration from DB:', e)
  }

  // 2) Fallback to environment variables if not found in database
  if (!accessToken) {
    accessToken = pickFirst(
      process.env.WHATSAPP_ACCESS_TOKEN,
      process.env.META_ACCESS_TOKEN
    )
    if (accessToken) {
      tokenSource = 'env'
    }
  }

  if (!phoneNumberId) {
    phoneNumberId = pickFirst(
      process.env.WHATSAPP_PHONE_NUMBER_ID,
      process.env.META_PHONE_NUMBER_ID
    )
  }

  if (!wabaId) {
    wabaId = pickFirst(
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      process.env.META_WABA_ID,
      process.env.WHATSAPP_WABA_ID
    )
  }

  // Validate required fields
  if (!accessToken) {
    const errorMsg = 'WhatsApp Access Token not configured. Set it in Integrations (preferred) or env WHATSAPP_ACCESS_TOKEN / META_ACCESS_TOKEN.'
    console.error(`❌ [WHATSAPP-CREDENTIALS] ${errorMsg}`)
    throw new Error(errorMsg)
  }

  if (!phoneNumberId) {
    console.warn('⚠️ [WHATSAPP-CREDENTIALS] phoneNumberId not configured (may be optional for some operations)')
  }

  return { accessToken, phoneNumberId: phoneNumberId || '', wabaId, tokenSource }
}

/**
 * Send a text message via WhatsApp Cloud API
 * STEP 5: Includes outbound idempotency check
 * 
 * @param toE164 - Phone number in E.164 format (e.g., +971501234567)
 * @param body - Message text content
 * @param options - Optional: contactId, leadId for idempotency check
 * @returns WhatsApp message ID
 */
export async function sendTextMessage(
  toE164: string,
  body: string,
  options?: { contactId?: number; leadId?: number | null; skipIdempotency?: boolean }
): Promise<{ messageId: string; waId?: string }> {
  // STEP 5: Check outbound idempotency before sending
  if (options?.contactId && !options.skipIdempotency) {
    const { checkOutboundIdempotency } = await import('./outbound/idempotency')
    const idempotencyCheck = await checkOutboundIdempotency(
      options.contactId,
      options.leadId || null,
      body,
      'whatsapp',
      5 // 5-minute window
    )

    if (idempotencyCheck.isDuplicate) {
      console.log(`⚠️ [WHATSAPP] Skipping duplicate message: ${idempotencyCheck.reason}`)
      throw new Error(`DUPLICATE_MESSAGE: ${idempotencyCheck.reason}`)
    }
  }

  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

  const normalizedPhone = normalizeToE164(toE164)

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: 'text',
    text: {
      preview_url: false,
      body: body,
    },
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'whatsapp.ts:107',message:'Before WhatsApp API call',data:{normalizedPhone,phoneNumberId,bodyLength:body.length,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  try {
    console.log(`📤 [WHATSAPP-SEND] Sending to ${normalizedPhone} via ${phoneNumberId}`)
    console.log(`📤 [WHATSAPP-SEND] Payload:`, JSON.stringify(payload).substring(0, 200))
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    console.log(`📡 [WHATSAPP-SEND] Response status: ${response.status} ${response.statusText}`)

    const data = await response.json()
    console.log(`📡 [WHATSAPP-SEND] Response data:`, JSON.stringify(data).substring(0, 500))
    
    // TASK 5: Log full Meta response (including pacing status)
    const metaResponse = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      data: data,
      timestamp: new Date().toISOString(),
    }
    console.log(`📡 [WHATSAPP-SEND] Full Meta response:`, JSON.stringify(metaResponse))

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'whatsapp.ts:148',message:'WhatsApp API response',data:{status:response.status,ok:response.ok,hasError:!!(data as any).error,errorMessage:(data as any).error?.message,hasPacing:!!(data as any).messages?.[0]?.pacing},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (!response.ok) {
      const error = data as WhatsAppError
      const errorMessage = error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      const errorCode = error.error?.code
      const errorType = error.error?.type
      console.error(`❌ [WHATSAPP-SEND] API error:`, errorMessage)
      console.error(`❌ [WHATSAPP-SEND] Error code:`, errorCode)
      console.error(`❌ [WHATSAPP-SEND] Error type:`, errorType)
      console.error(`❌ [WHATSAPP-SEND] Full error:`, JSON.stringify(error))
      console.error(`❌ [WHATSAPP-SEND] Request details:`, {
        url,
        phoneNumberId,
        normalizedPhone,
        hasAccessToken: !!accessToken,
      })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'whatsapp.ts:154',message:'WhatsApp API error response',data:{status:response.status,errorMessage,errorCode,errorType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      throw new Error(errorMessage)
    }

    const result = data as WhatsAppResponse
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      console.error(`❌ [WHATSAPP-SEND] No message ID in response:`, JSON.stringify(result))
      throw new Error('WhatsApp API did not return a message ID')
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'whatsapp.ts:154',message:'WhatsApp send success',data:{messageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    console.log(`✅ [WHATSAPP-SEND] Success! Message ID: ${messageId}`)
    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    console.error(`❌ [WHATSAPP-SEND] Exception caught:`, error.message)
    console.error(`❌ [WHATSAPP-SEND] Stack:`, error.stack)
    if (error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to send WhatsApp message: ${error.message}`)
  }
}

/**
 * Send a template message via WhatsApp Cloud API
 * Templates must be pre-approved by Meta
 * 
 * @param toE164 - Phone number in E.164 format
 * @param templateName - Name of the approved template
 * @param language - Language code (default: "en_US")
 * @param params - Array of parameter values for template variables {{1}}, {{2}}, etc.
 * @returns WhatsApp message ID
 */
export async function sendTemplateMessage(
  toE164: string,
  templateName: string,
  language: string = 'en_US',
  params: string[] = []
): Promise<{ messageId: string; waId?: string }> {
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

  const normalizedPhone = normalizeToE164(toE164)

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  const components: any[] = []

  if (params.length > 0) {
    components.push({
      type: 'body',
      parameters: params.map((param) => ({
        type: 'text',
        text: param,
      })),
    })
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: language,
      },
      components: components.length > 0 ? components : undefined,
    },
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      const error = data as WhatsAppError
      throw new Error(
        error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      )
    }

    const result = data as WhatsAppResponse
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      throw new Error('WhatsApp API did not return a message ID')
    }

    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    if (error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to send WhatsApp template: ${error.message}`)
  }
}

/**
 * Send a media message (image, document, video, audio) via WhatsApp Cloud API
 * 
 * @param toE164 - Phone number in E.164 format
 * @param mediaType - Type of media: 'image', 'document', 'video', 'audio'
 * @param mediaUrl - Public URL of the media file (must be HTTPS and accessible by Meta)
 * @param caption - Optional caption for image/video
 * @param filename - Optional filename for document
 * @returns WhatsApp message ID
 */
export async function sendMediaMessage(
  toE164: string,
  mediaType: 'image' | 'document' | 'video' | 'audio',
  mediaUrl: string,
  options?: {
    caption?: string
    filename?: string
  }
): Promise<{ messageId: string; waId?: string }> {
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

  const normalizedPhone = normalizeToE164(toE164)

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  // Build payload based on media type
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: mediaType,
  }

  if (mediaType === 'image') {
    payload.image = {
      link: mediaUrl,
      ...(options?.caption ? { caption: options.caption } : {}),
    }
  } else if (mediaType === 'video') {
    payload.video = {
      link: mediaUrl,
      ...(options?.caption ? { caption: options.caption } : {}),
    }
  } else if (mediaType === 'document') {
    payload.document = {
      link: mediaUrl,
      ...(options?.filename ? { filename: options.filename } : {}),
    }
  } else if (mediaType === 'audio') {
    payload.audio = {
      link: mediaUrl,
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      const error = data as WhatsAppError
      throw new Error(
        error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      )
    }

    const result = data as WhatsAppResponse
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      throw new Error('WhatsApp API did not return a message ID')
    }

    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    if (error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to send WhatsApp media: ${error.message}`)
  }
}

