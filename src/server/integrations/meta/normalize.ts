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

    // Process messaging events
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

    // Process leadgen events
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

  return normalized
}

