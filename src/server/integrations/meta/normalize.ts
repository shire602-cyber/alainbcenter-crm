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
      // INSTAGRAM STRUCTURE: entry.changes[].value.messages[] OR entry.messaging[]
      // Instagram webhooks can use either structure - prioritize based on what's present
      const changes = entry.changes || []
      const messaging = entry.messaging || []
      
      console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Processing Instagram entry', {
        pageId,
        changesCount: changes.length,
        changesFields: changes.map((c: any) => c.field),
        messagingCount: messaging.length,
        hasChanges: changes.length > 0,
        hasMessaging: messaging.length > 0,
        normalizationPath: changes.length > 0 ? 'changes[] first' : messaging.length > 0 ? 'messaging[] only' : 'none',
      })
      
      // If entry.changes is empty but entry.messaging exists, process messaging[] immediately
      // This handles the case where Instagram sends entry.messaging[] structure
      if (changes.length === 0 && messaging.length > 0) {
        console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: entry.changes is empty, processing messaging[] structure immediately', {
          messagingCount: messaging.length,
        })
        
        for (const event of messaging) {
          console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Processing messaging event (primary path)', {
            eventKeys: Object.keys(event),
            hasSender: !!event.sender,
            hasRecipient: !!event.recipient,
            hasMessage: !!event.message,
            hasTimestamp: !!event.timestamp,
          })
          
          const normalizedEvent: NormalizedWebhookEvent = {
            pageId,
            eventType: 'message',
            rawPayload: event,
          }

          // Extract sender ID: event.sender.id
          if (event.sender) {
            normalizedEvent.senderId = event.sender.id || event.sender
            console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Extracted senderId from messaging (primary)', {
              sender: event.sender,
              extracted: normalizedEvent.senderId,
            })
          }

          // Extract recipient ID: event.recipient.id
          if (event.recipient) {
            normalizedEvent.recipientId = event.recipient.id || event.recipient
          }

          // Extract timestamp
          if (event.timestamp) {
            normalizedEvent.timestamp = new Date(event.timestamp * 1000)
          }

          // Extract message ID and text from event.message
          if (event.message) {
            normalizedEvent.messageId = event.message.mid || event.message.id
            normalizedEvent.text = event.message.text || ''
            console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Extracted message from messaging (primary)', {
              messageId: normalizedEvent.messageId,
              hasText: !!normalizedEvent.text,
              textPreview: normalizedEvent.text ? `${normalizedEvent.text.substring(0, 30)}...` : '[no text]',
            })
          } else {
            console.warn('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Messaging event missing "message" field (primary)', {
              eventKeys: Object.keys(event),
            })
          }

          normalized.push(normalizedEvent)
        }
        
        // Skip changes processing since we've already handled messaging[]
        console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Completed messaging[] processing (primary path)', {
          normalizedCount: normalized.length,
        })
      } else {
        // Primary structure: entry.changes[].value.messages[] (if changes exist)
        for (const change of changes) {
          console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Processing change', {
            field: change.field,
            valueKeys: change.value ? Object.keys(change.value) : [],
            hasMessages: !!change.value?.messages,
            messagesCount: change.value?.messages?.length || 0,
          })
        
        // Instagram messages come in changes with field: "messages"
        if (change.field === 'messages' && change.value?.messages) {
          console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Found messages in changes', {
            messageCount: change.value.messages.length,
          })
          
          for (const message of change.value.messages) {
            console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Processing message', {
              messageKeys: Object.keys(message),
              hasFrom: !!message.from,
              fromValue: message.from,
              hasText: !!message.text,
              textPreview: message.text ? `${message.text.substring(0, 30)}...` : '[no text]',
              hasId: !!message.id,
              idValue: message.id,
              hasMid: !!message.mid,
              midValue: message.mid,
              hasTimestamp: !!message.timestamp,
              timestampValue: message.timestamp,
            })
            
            const normalizedEvent: NormalizedWebhookEvent = {
              pageId,
              eventType: 'message',
              rawPayload: message, // Store full message object for attachment extraction
            }

            // Extract sender ID: message.from.id or message.from (if string)
            if (message.from) {
              normalizedEvent.senderId = typeof message.from === 'string' 
                ? message.from 
                : (message.from.id || message.from)
              console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Extracted senderId', {
                original: message.from,
                extracted: normalizedEvent.senderId,
              })
            } else {
              console.warn('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Message missing "from" field', {
                messageKeys: Object.keys(message),
              })
            }

            // Extract recipient ID: message.to.id or message.to (if string)
            if (message.to) {
              normalizedEvent.recipientId = typeof message.to === 'string'
                ? message.to
                : (message.to.id || message.to)
            }

            // Extract timestamp (Instagram uses Unix timestamp in seconds as string or number)
            if (message.timestamp) {
              const timestampValue = typeof message.timestamp === 'string' 
                ? parseInt(message.timestamp, 10) 
                : message.timestamp
              normalizedEvent.timestamp = new Date(timestampValue * 1000)
            }

            // Extract message ID (can be 'id' or 'mid')
            normalizedEvent.messageId = message.mid || message.id

            // Extract text: message.text (direct property for Instagram)
            normalizedEvent.text = message.text || ''

            console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Created normalized event', {
              eventType: normalizedEvent.eventType,
              senderId: normalizedEvent.senderId || 'MISSING',
              messageId: normalizedEvent.messageId || 'MISSING',
              hasText: !!normalizedEvent.text,
              textLength: normalizedEvent.text?.length || 0,
            })

            normalized.push(normalizedEvent)
          }
        } else if (change.field === 'messages' && !change.value?.messages) {
          console.warn('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Change field is "messages" but value.messages is missing', {
            field: change.field,
            valueKeys: change.value ? Object.keys(change.value) : [],
            value: change.value,
          })
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

      // Fallback structure: entry.messaging[] (if changes structure not found)
      // This handles alternate Instagram webhook formats (similar to Facebook Page)
      if (normalized.length === 0 && messaging.length > 0) {
        console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: No events from changes, trying messaging[] fallback', {
          messagingCount: messaging.length,
        })
        
        for (const event of messaging) {
          console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Processing messaging event', {
            eventKeys: Object.keys(event),
            hasSender: !!event.sender,
            hasRecipient: !!event.recipient,
            hasMessage: !!event.message,
            hasTimestamp: !!event.timestamp,
          })
          
          const normalizedEvent: NormalizedWebhookEvent = {
            pageId,
            eventType: 'message',
            rawPayload: event,
          }

          // Extract sender ID: event.sender.id
          if (event.sender) {
            normalizedEvent.senderId = event.sender.id || event.sender
            console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Extracted senderId from messaging', {
              sender: event.sender,
              extracted: normalizedEvent.senderId,
            })
          }

          // Extract recipient ID: event.recipient.id
          if (event.recipient) {
            normalizedEvent.recipientId = event.recipient.id || event.recipient
          }

          // Extract timestamp
          if (event.timestamp) {
            normalizedEvent.timestamp = new Date(event.timestamp * 1000)
          }

          // Extract message ID and text from event.message
          if (event.message) {
            normalizedEvent.messageId = event.message.mid || event.message.id
            normalizedEvent.text = event.message.text || ''
            console.log('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Extracted message from messaging', {
              messageId: normalizedEvent.messageId,
              hasText: !!normalizedEvent.text,
              textPreview: normalizedEvent.text ? `${normalizedEvent.text.substring(0, 30)}...` : '[no text]',
            })
          } else {
            console.warn('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: Messaging event missing "message" field', {
              eventKeys: Object.keys(event),
            })
          }

          normalized.push(normalizedEvent)
        }
      }
      
      // Check if we still have no normalized events
      if (normalized.length === 0) {
        console.warn('[META-WEBHOOK-INSTAGRAM-DEBUG] Normalize: No events normalized and no messaging array available', {
          changesCount: changes.length,
          messagingCount: messaging.length,
          entryKeys: Object.keys(entry),
        })
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
  }

  return normalized
}

