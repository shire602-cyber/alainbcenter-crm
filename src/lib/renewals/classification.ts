/**
 * Renewal Expiry Classification Helpers
 * Classifies renewals based on days until expiry
 */

import { differenceInDays } from 'date-fns'

export type ExpiryClassification = 'urgent' | 'warning' | 'early' | 'expired'

export interface ClassificationResult {
  classification: ExpiryClassification
  daysRemaining: number
  label: string
  color: string
}

/**
 * Classify renewal based on expiry date
 * 
 * - urgent: <= 14 days remaining
 * - warning: 15-30 days remaining
 * - early: 31-90 days remaining
 * - expired: < 0 days (already expired)
 */
export function classifyExpiry(
  expiryDate: Date | string,
  now: Date = new Date()
): ClassificationResult {
  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
  const daysRemaining = differenceInDays(expiry, now)

  if (daysRemaining < 0) {
    return {
      classification: 'expired',
      daysRemaining,
      label: `Expired ${Math.abs(daysRemaining)} days ago`,
      color: 'red',
    }
  }

  if (daysRemaining <= 14) {
    return {
      classification: 'urgent',
      daysRemaining,
      label: `${daysRemaining} days remaining`,
      color: 'red',
    }
  }

  if (daysRemaining <= 30) {
    return {
      classification: 'warning',
      daysRemaining,
      label: `${daysRemaining} days remaining`,
      color: 'orange',
    }
  }

  if (daysRemaining <= 90) {
    return {
      classification: 'early',
      daysRemaining,
      label: `${daysRemaining} days remaining`,
      color: 'blue',
    }
  }

  // More than 90 days - still early but not urgent
  return {
    classification: 'early',
    daysRemaining,
    label: `${daysRemaining} days remaining`,
    color: 'gray',
  }
}

/**
 * Check if renewal is urgent (<= 14 days)
 */
export function isUrgent(expiryDate: Date | string, now: Date = new Date()): boolean {
  return classifyExpiry(expiryDate, now).classification === 'urgent'
}

/**
 * Check if renewal is in warning zone (15-30 days)
 */
export function isWarning(expiryDate: Date | string, now: Date = new Date()): boolean {
  return classifyExpiry(expiryDate, now).classification === 'warning'
}

/**
 * Check if renewal is early (31-90 days)
 */
export function isEarly(expiryDate: Date | string, now: Date = new Date()): boolean {
  return classifyExpiry(expiryDate, now).classification === 'early'
}

/**
 * Check if renewal has expired
 */
export function isExpired(expiryDate: Date | string, now: Date = new Date()): boolean {
  return classifyExpiry(expiryDate, now).classification === 'expired'
}

/**
 * Get priority score for sorting (lower = higher priority)
 */
export function getExpiryPriority(expiryDate: Date | string, now: Date = new Date()): number {
  const classification = classifyExpiry(expiryDate, now).classification
  const priorityMap: Record<ExpiryClassification, number> = {
    expired: 0, // Highest priority
    urgent: 1,
    warning: 2,
    early: 3,
  }
  return priorityMap[classification]
}

