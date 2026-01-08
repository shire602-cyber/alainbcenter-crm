/**
 * Meta integration configuration management
 * Stores webhook verify token in database (Integration table)
 */

import { prisma } from '@/lib/prisma'

const INTEGRATION_NAME = 'instagram-messaging'

/**
 * Get webhook verify token from database
 * Falls back to environment variable for backward compatibility
 */
export async function getWebhookVerifyToken(): Promise<string | null> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { name: INTEGRATION_NAME },
      select: { config: true },
    })

    if (integration?.config) {
      try {
        const config = JSON.parse(integration.config)
        if (config.webhookVerifyToken) {
          return config.webhookVerifyToken
        }
      } catch {
        // Invalid JSON, continue to fallback
      }
    }

    // Fallback to environment variable (for backward compatibility)
    return process.env.META_VERIFY_TOKEN || null
  } catch (error) {
    console.error('Failed to get webhook verify token:', error)
    // Fallback to environment variable
    return process.env.META_VERIFY_TOKEN || null
  }
}

/**
 * Set webhook verify token in database
 */
export async function setWebhookVerifyToken(token: string): Promise<void> {
  try {
    // Get or create integration
    const existing = await prisma.integration.findUnique({
      where: { name: INTEGRATION_NAME },
    })

    let config: Record<string, any> = {}
    if (existing?.config) {
      try {
        config = JSON.parse(existing.config)
      } catch {
        config = {}
      }
    }

    config.webhookVerifyToken = token

    if (existing) {
      await prisma.integration.update({
        where: { name: INTEGRATION_NAME },
        data: {
          config: JSON.stringify(config),
        },
      })
    } else {
      await prisma.integration.create({
        data: {
          name: INTEGRATION_NAME,
          provider: 'Meta Messaging API',
          isEnabled: false,
          config: JSON.stringify(config),
        },
      })
    }
  } catch (error) {
    console.error('Failed to set webhook verify token:', error)
    throw error
  }
}

/**
 * Get app secret (optional, for signature verification)
 * Only from environment variable (server-side only)
 */
export function getAppSecret(): string | null {
  return process.env.META_APP_SECRET || null
}

