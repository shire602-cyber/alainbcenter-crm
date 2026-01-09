/**
 * Normalize webhook events into common internal shape
 * Isolated module for event normalization
 */

export interface NormalizedWebhookEvent {
  pageId: string // Note: For Instagram events, this is actually the IG Business Account ID
  eventType: 'message' | 'postback' | 'delivery' | 'read' | 'leadgen' | 'unknown'
  senderId?: string
  recipientId?: string
  messageId?: string
  text?: string
  timestamp?: Date
  rawPayload: any
}

/**
 * Normalize a webhook event payload
 * 
 * Handles two different payload structures:
 * - Facebook Page webhooks (object: 'page'): entry.messaging[]
 * - Instagram webhooks (object: 'instagram'): entry.changes[0].value.messages[]
 */
export function normalizeWebhookEvent(payload: any): NormalizedWebhookEvent[] {
  const normalized: NormalizedWebhookEvent[] = []

  if (payload.object !== 'page' && payload.object !== 'instagram') {
    return normalized
  }

  const entries = payload.entry || []

  for (const entry of entries) {
    // Note: entry.id is pageId for object='page', but IG Business Account ID for object='instagram'
    // The connection resolution happens in the webhook handler, so we just pass it through here
    const pageId = entry.id

    if (payload.object === 'instagram') {
      // INSTAGRAM STRUCTURE: entry.changes[0].value.messages[]
      // Instagram webhooks use the same structure as WhatsApp: entry.changes[].value.messages[]
      const changes = entry.changes || []
      
      for (const change of changes) {
        // Instagram messages come in changes with field: "messages"
        if (change.field === 'messages' && change.value?.messages) {
          for (const message of change.value.messages) {
            const normalizedEvent: NormalizedWebhookEvent = {
              pageId,
              eventType: 'message',
              rawPayload: message, // Store full message object for attachment extraction
            }

            // Extract sender ID (can be object with id property or string)
            if (message.from) {
              normalizedEvent.senderId = typeof message.from === 'string' 
                ? message.from 
                : message.from.id
            }

            // Extract recipient ID (if present)
            if (message.to) {
              normalizedEvent.recipientId = typeof message.to === 'string'
                ? message.to
                : message.to.id
            }

            // Extract timestamp (Instagram uses Unix timestamp in seconds as string)
            if (message.timestamp) {
              const timestampValue = typeof message.timestamp === 'string' 
                ? parseInt(message.timestamp, 10) 
                : message.timestamp
              normalizedEvent.timestamp = new Date(timestampValue * 1000)
            }

            // Extract message ID (can be 'id' or 'mid')
            normalizedEvent.messageId = message.mid || message.id

            // Extract text (Instagram messages have text directly, not nested)
            normalizedEvent.text = message.text || ''

            normalized.push(normalizedEvent)
          }
        }

        // Handle Instagram postbacks
        if (change.field === 'messaging_postbacks' && change.value?.postbacks) {
          for (const postback of change.value.postbacks) {
            normalized.push({
              pageId,
              eventType: 'postback',
              rawPayload: postback,
            })
          }
        }
      }
    } else {
      // FACEBOOK PAGE STRUCTURE: entry.messaging[]
      // This is the original structure - keep unchanged for backward compatibility
      const messagingEvents = entry.messaging || []

      for (const event of messagingEvents) {
        const normalizedEvent: NormalizedWebhookEvent = {
          pageId,
          eventType: 'unknown',
          rawPayload: event,
        }

        if (event.sender) {
          normalizedEvent.senderId = event.sender.id
        }

        if (event.recipient) {
          normalizedEvent.recipientId = event.recipient.id
        }

        if (event.timestamp) {
          normalizedEvent.timestamp = new Date(event.timestamp * 1000)
        }

        // Determine event type
        if (event.message) {
          normalizedEvent.eventType = 'message'
          normalizedEvent.messageId = event.message.mid
          normalizedEvent.text = event.message.text
        } else if (event.postback) {
          normalizedEvent.eventType = 'postback'
        } else if (event.delivery) {
          normalizedEvent.eventType = 'delivery'
        } else if (event.read) {
          normalizedEvent.eventType = 'read'
        }

        normalized.push(normalizedEvent)
      }

      // Process leadgen events for Facebook Page webhooks
      const changes = entry.changes || []
      for (const change of changes) {
        if (change.field === 'leadgen' && change.value) {
          normalized.push({
            pageId,
            eventType: 'leadgen',
            rawPayload: change.value,
          })
        }
      }
    }
  }

  return normalized
}

