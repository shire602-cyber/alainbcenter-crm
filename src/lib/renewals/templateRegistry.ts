/**
 * RENEWAL TEMPLATE REGISTRY
 * 
 * Maps reminder stage + channel → template name
 * Single source of truth for template names.
 */

export type RenewalChannel = 'whatsapp' | 'facebook'

export type RenewalStage = 1 | 2 | 3

/**
 * Template registry: channel + stage → template name
 */
const TEMPLATE_REGISTRY: Record<RenewalChannel, Record<RenewalStage, string>> = {
  whatsapp: {
    1: 'renewal_notification_r1',
    2: 'renewal_notification_r2',
    3: 'renewal_notification_r3',
  },
  facebook: {
    1: 'fb_renewal_reminder_1',
    2: 'fb_renewal_reminder_2',
    3: 'fb_renewal_reminder_3',
  },
}

/**
 * Get template name for renewal reminder
 * 
 * @param channel - Channel: 'whatsapp' | 'facebook'
 * @param stage - Reminder stage: 1, 2, or 3
 * @returns Template name
 */
export function getRenewalTemplate(
  channel: RenewalChannel,
  stage: RenewalStage
): string {
  const templateName = TEMPLATE_REGISTRY[channel]?.[stage]
  
  if (!templateName) {
    throw new Error(
      `No template found for channel=${channel}, stage=${stage}. Valid stages: 1, 2, 3`
    )
  }
  
  return templateName
}

/**
 * Get all configured channels for renewal reminders
 * Default: ['whatsapp'] (can be extended to include 'facebook')
 */
export function getRenewalChannels(): RenewalChannel[] {
  // For now, only WhatsApp is supported
  // Can be extended to include Facebook when needed
  return ['whatsapp']
}

