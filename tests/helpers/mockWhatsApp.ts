/**
 * Mock WhatsApp Send Function
 * 
 * Tracks all outbound sends for testing idempotency
 */

export interface MockSendCall {
  to: string
  text: string
  timestamp: Date
  messageId: string
}

let mockSendCalls: MockSendCall[] = []
let messageIdCounter = 0

/**
 * Reset mock send calls tracker
 */
export function resetMockSendCalls() {
  mockSendCalls = []
  messageIdCounter = 0
}

/**
 * Get all mock send calls
 */
export function getMockSendCalls(): MockSendCall[] {
  return [...mockSendCalls]
}

/**
 * Get count of mock send calls
 */
export function getMockSendCallCount(): number {
  return mockSendCalls.length
}

/**
 * Mock sendTextMessage function
 * Returns a message ID and records the call
 */
export async function mockSendTextMessage(
  toE164: string,
  body: string
): Promise<{ messageId: string; waId?: string }> {
  messageIdCounter++
  const messageId = `wamid.test.${Date.now()}.${messageIdCounter}`
  
  mockSendCalls.push({
    to: toE164,
    text: body,
    timestamp: new Date(),
    messageId,
  })
  
  console.log(`📤 [MOCK-SEND] Called: to=${toE164}, messageId=${messageId}, text="${body.substring(0, 50)}..."`)
  
  return {
    messageId,
    waId: toE164.replace('+', ''),
  }
}

/**
 * Check if a specific message was sent
 */
export function wasMessageSent(text: string): boolean {
  return mockSendCalls.some(call => call.text === text)
}

/**
 * Check if message was sent to specific number
 */
export function wasMessageSentTo(phone: string, text?: string): boolean {
  return mockSendCalls.some(call => {
    const phoneMatch = call.to === phone || call.to.replace('+', '') === phone.replace('+', '')
    if (text) {
      return phoneMatch && call.text === text
    }
    return phoneMatch
  })
}

/**
 * Get all messages sent to a specific number
 */
export function getMessagesSentTo(phone: string): MockSendCall[] {
  return mockSendCalls.filter(call => {
    return call.to === phone || call.to.replace('+', '') === phone.replace('+', '')
  })
}

