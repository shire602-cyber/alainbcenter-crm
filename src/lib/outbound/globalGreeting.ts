/**
 * GLOBAL BRANDED GREETING PREFIX
 * 
 * PREMIUM, NON-REPETITIVE, CONTEXT-AWARE BRANDING:
 * - Full branded greeting ONLY on the first outbound message in a conversation
 * - Subsequent messages should NOT repeat the greeting
 * - Remove "How can I help you today?" from mid-flow messages
 * - Keep branding consistent and professional
 */

// FULL_GREETING (used only once, on first outbound)
const FULL_GREETING = "Hi 👋 I'm ABCai from Al Ain Business Center.\n\n"

// SHORT_PREFIX (optional, for later messages if needed - currently not used)
const SHORT_PREFIX = "ABCai: "

export interface GreetingContext {
  isFirstOutboundMessage: boolean
  conversationId: number
}

/**
 * Apply global greeting prefix to message (context-aware)
 * 
 * Rules:
 * - If isFirstOutboundMessage === true: Prepend FULL_GREETING
 * - Else: Do NOT prepend FULL_GREETING
 * - Never add "How can I help you today?" outside the first message
 * - Never duplicate prefixes if message already starts with them
 * 
 * @param message - The message text to apply greeting to
 * @param context - Context about whether this is the first outbound message
 * @returns Message with global greeting prefix (if first message and not already present)
 */
export function withGlobalGreeting(
  message: string,
  context: GreetingContext
): string {
  // Normalize input
  const normalizedMessage = message.trim()
  
  // Check if message already starts with exact greeting
  if (normalizedMessage.startsWith(FULL_GREETING.trim())) {
    // Already has greeting - return as-is
    return message
  }
  
  // Only add greeting on first outbound message
  if (context.isFirstOutboundMessage) {
    // Prepend full greeting
    return FULL_GREETING + normalizedMessage
  }
  
  // Not first message - return as-is (no greeting)
  return message
}

/**
 * Check if message already has global greeting
 */
export function hasGlobalGreeting(message: string): boolean {
  return message.trim().startsWith(FULL_GREETING.trim())
}

/**
 * Check if message contains the old question text (should be removed)
 */
export function hasOldQuestionText(message: string): boolean {
  return message.toLowerCase().includes('how can i help you today')
}

