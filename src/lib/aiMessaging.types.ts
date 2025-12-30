/**
 * Type definitions for AI Messaging (backward compatibility)
 */

export type AIMessageMode = 'QUALIFY' | 'FOLLOW_UP' | 'REMINDER' | 'DOCS' | 'SUPPORT'

export interface AIMessageContext {
  lead: any
  contact: any
  recentMessages?: Array<{ direction: string; body: string; createdAt: Date }>
  mode: AIMessageMode
  channel: string
  language?: 'en' | 'ar'
}


