/**
 * Renewal Service
 * 
 * Source of truth for expiry-related messaging
 * Handles template variable mapping and reminder scheduling
 */

import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'

export interface RenewalTemplateVars {
  customerName: string // Maps to {{1}}
  serviceType: string // Maps to {{2}}
  expiryDate: string // Maps to {{3}} - formatted date
}

/**
 * Map renewal data to WhatsApp template variables
 * AI must NOT generate or modify these values
 */
export function mapRenewalToTemplateVars(
  renewal: {
    serviceType: string
    expiryDate: Date
    contact: {
      fullName: string
    }
  }
): RenewalTemplateVars {
  return {
    customerName: renewal.contact.fullName || 'Valued Customer',
    serviceType: renewal.serviceType,
    expiryDate: format(renewal.expiryDate, 'dd MMM yyyy'), // e.g., "15 Jan 2025"
  }
}

/**
 * Convert template vars to WhatsApp template parameters array
 * {{1}} = customerName, {{2}} = serviceType, {{3}} = expiryDate
 */
export function templateVarsToParams(vars: RenewalTemplateVars): string[] {
  return [vars.customerName, vars.serviceType, vars.expiryDate]
}

/**
 * Calculate next reminder date based on schedule
 * Returns the next reminder date that hasn't passed yet
 */
export function calculateNextReminderAt(
  expiryDate: Date,
  reminderSchedule: number[], // e.g., [30, 14, 7, 1] days before expiry
  lastNotifiedAt: Date | null
): Date | null {
  const now = new Date()
  const expiry = new Date(expiryDate)
  
  // If expiry has passed, no more reminders
  if (expiry <= now) {
    return null
  }

  // Find the next reminder that hasn't been sent yet
  for (const daysBefore of reminderSchedule) {
    const reminderDate = new Date(expiry)
    reminderDate.setDate(reminderDate.getDate() - daysBefore)
    
    // If this reminder date is in the future and hasn't been sent
    if (reminderDate > now) {
      // Check if we already sent a reminder for this date
      if (lastNotifiedAt) {
        const lastReminderDate = new Date(lastNotifiedAt)
        lastReminderDate.setHours(0, 0, 0, 0)
        const thisReminderDate = new Date(reminderDate)
        thisReminderDate.setHours(0, 0, 0, 0)
        
        // If we already sent for this date, skip to next
        if (lastReminderDate.getTime() === thisReminderDate.getTime()) {
          continue
        }
      }
      
      return reminderDate
    }
  }
  
  return null
}

/**
 * Parse reminder schedule from JSON string
 */
export function parseReminderSchedule(scheduleStr: string): number[] {
  try {
    const parsed = JSON.parse(scheduleStr)
    if (Array.isArray(parsed)) {
      return parsed.filter((n) => typeof n === 'number' && n > 0).sort((a, b) => b - a) // Sort descending
    }
  } catch (e) {
    // Invalid JSON, use default
  }
  return [30, 14, 7, 1] // Default schedule
}

/**
 * Get reminder date key for idempotency
 * Format: YYYY-MM-DD
 */
export function getReminderDateKey(reminderDate: Date): string {
  return format(reminderDate, 'yyyy-MM-dd')
}

/**
 * Generate idempotency key for renewal notification
 * Format: renewal:{renewalId}:{reminderDate}:{templateName}
 */
export function generateRenewalIdempotencyKey(
  renewalId: number,
  reminderDate: Date,
  templateName: string
): string {
  const dateKey = getReminderDateKey(reminderDate)
  return `renewal:${renewalId}:${dateKey}:${templateName}`
}

