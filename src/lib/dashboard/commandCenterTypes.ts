/**
 * COMMAND CENTER TYPES
 * 
 * Types for the Personal Command Center dashboard
 */

export type CommandItemKind = 'reply' | 'task' | 'quote' | 'renewal' | 'waiting' | 'alert'

export interface CommandItem {
  kind: CommandItemKind
  id: string // stable id: `${kind}:${leadId || conversationId || taskId}`
  leadId?: number
  conversationId?: number
  taskId?: number
  title: string // e.g. "Reply to Ahmed (Freelance Visa)"
  preview?: string // last inbound message snippet
  channel?: 'whatsapp' | 'instagram' | 'facebook' | 'email'
  waitingDays?: number
  revenueHint?: string // "AED 12,999 offer" or "Renewal likely"
  slaLabel?: string // "SLA risk" (only label, no red background)
  primaryCta: {
    label: string
    href?: string
    action?: 'open_reply' | 'open_lead' | 'open_inbox' | 'open_quote' | 'open_tasks'
  }
}

export interface CommandCenterData {
  focusNow: CommandItem | null
  upNext: CommandItem[] // max 3
  signals: {
    renewals: any[]
    waiting: any[]
    alerts: any[]
    counts: {
      renewalsTotal: number
      waitingTotal: number
      alertsTotal: number
    }
  }
  momentum: {
    repliesToday: number
    quotesToday: number
    renewalsNext7Days: number
    revenuePotentialToday: number | null
  }
  completedToday: {
    tasksDone: number
    messagesSent: number
    quotesSent: number
  }
  generatedAt: string
}

