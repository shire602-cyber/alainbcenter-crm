/**
 * Meta WhatsApp Webhook Payload Builders
 * 
 * Helper functions to generate Meta webhook payloads for testing
 */

export interface InboundTextPayloadOptions {
  id: string // providerMessageId
  from: string // Phone number without + (e.g., "971501234567")
  text: string // Message text
  timestamp?: number // Unix timestamp (seconds)
  phoneNumberId?: string // Meta phone number ID
}

export interface StatusPayloadOptions {
  id: string // Message ID
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: number
  errors?: Array<{ code: number; title: string; message: string }>
}

/**
 * Build inbound text message payload (Meta format)
 */
export function buildInboundTextPayload(options: InboundTextPayloadOptions) {
  const {
    id,
    from,
    text,
    timestamp = Math.floor(Date.now() / 1000),
    phoneNumberId = '123456789',
  } = options

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '971501234567',
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: {
                    name: 'Test User',
                  },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from: from,
                  id: id,
                  timestamp: timestamp.toString(),
                  type: 'text',
                  text: {
                    body: text,
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }
}

/**
 * Build duplicate payload with same providerMessageId
 */
export function buildDuplicatePayloadSameId(
  originalPayload: ReturnType<typeof buildInboundTextPayload>
): ReturnType<typeof buildInboundTextPayload> {
  // Return exact same payload (same ID)
  return JSON.parse(JSON.stringify(originalPayload))
}

/**
 * Build inbound message with same text but new providerMessageId
 */
export function buildInboundTextPayloadNewId(
  originalPayload: ReturnType<typeof buildInboundTextPayload>,
  newId: string
): ReturnType<typeof buildInboundTextPayload> {
  const payload = JSON.parse(JSON.stringify(originalPayload))
  payload.entry[0].changes[0].value.messages[0].id = newId
  payload.entry[0].changes[0].value.messages[0].timestamp = Math.floor(Date.now() / 1000).toString()
  return payload
}

/**
 * Build status update payload (no messages array)
 */
export function buildInboundStatusPayload(options: StatusPayloadOptions) {
  const {
    id,
    status,
    timestamp = Math.floor(Date.now() / 1000),
    errors = [],
  } = options

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '971501234567',
                phone_number_id: '123456789',
              },
              statuses: [
                {
                  id: id,
                  status: status,
                  timestamp: timestamp.toString(),
                  recipient_id: '971501234567',
                  ...(errors.length > 0 && { errors }),
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }
}

/**
 * Build echo payload (message from our own business number)
 */
export function buildEchoPayload(
  messageId: string,
  ourPhoneNumberId: string = '123456789'
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '971501234567',
                phone_number_id: ourPhoneNumberId,
              },
              messages: [
                {
                  from: ourPhoneNumberId, // Our own number
                  id: messageId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: {
                    body: 'Echo message from our number',
                  },
                  context: {
                    from: ourPhoneNumberId, // Indicates it's from us
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }
}

/**
 * Build webhook signature header (for testing signature verification)
 */
export function buildWebhookSignature(
  body: string,
  secret: string
): string {
  const crypto = require('crypto')
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  return `sha256=${hash}`
}

