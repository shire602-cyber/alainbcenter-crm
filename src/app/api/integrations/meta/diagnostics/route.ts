/**
 * GET /api/integrations/meta/diagnostics
 * Comprehensive diagnostic endpoint for Meta/Instagram webhook configuration
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getAllConnections, getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'
import { checkPageWebhookSubscription, checkInstagramWebhookSubscription } from '@/server/integrations/meta/subscribe'
import { getWebhookUrl } from '@/lib/publicUrl'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const diagnostics: {
      connectionExists: boolean
      connectionDetails: any
      pageSubscriptionStatus: any
      instagramSubscriptionStatus: any
      webhookUrlAccessibility: any
      verifyTokenConfigured: boolean
      verifyToken: string | null
      metaConsoleChecklist: {
        pageWebhookConfigured: boolean
        instagramWebhookConfigured: boolean
        webhookUrl: string
        verifyTokenMatches: boolean
        requiredFields: string[]
      }
      errors: string[]
      warnings: string[]
    } = {
      connectionExists: false,
      connectionDetails: null,
      pageSubscriptionStatus: null,
      instagramSubscriptionStatus: null,
      webhookUrlAccessibility: null,
      verifyTokenConfigured: false,
      verifyToken: null,
      metaConsoleChecklist: {
        pageWebhookConfigured: false,
        instagramWebhookConfigured: false,
        webhookUrl: '',
        verifyTokenMatches: false,
        requiredFields: ['messages', 'messaging_postbacks'],
      },
      errors: [],
      warnings: [],
    }

    // 1. Check if connection exists in database
    const connections = await getAllConnections(null)
    if (connections.length === 0) {
      diagnostics.errors.push('No Meta connection found in database. Please connect Meta integration first.')
      return NextResponse.json(diagnostics)
    }

    const connection = connections[0] // Use first connection
    diagnostics.connectionExists = true
    diagnostics.connectionDetails = {
      id: connection.id,
      pageId: connection.pageId,
      pageName: connection.pageName,
      igBusinessId: connection.igBusinessId,
      igUsername: connection.igUsername,
      status: connection.status,
      triggerSubscribed: connection.triggerSubscribed,
    }

    // 2. Check Page webhook subscription status
    if (connection.pageId) {
      try {
        const pageAccessToken = await getDecryptedPageToken(connection.id)
        if (pageAccessToken) {
          diagnostics.pageSubscriptionStatus = await checkPageWebhookSubscription(
            connection.pageId,
            pageAccessToken
          )
          if (diagnostics.pageSubscriptionStatus?.subscribed) {
            diagnostics.metaConsoleChecklist.pageWebhookConfigured = true
          } else {
            diagnostics.warnings.push('Facebook Page is not subscribed to webhooks. Page messages may not be received.')
          }
        } else {
          diagnostics.errors.push('Failed to decrypt page access token. Cannot check subscription status.')
        }
      } catch (error: any) {
        diagnostics.errors.push(`Failed to check Page subscription status: ${error.message}`)
      }
    } else {
      diagnostics.errors.push('Connection missing pageId')
    }

    // 3. Check Instagram Business Account webhook subscription status
    if (connection.igBusinessId) {
      try {
        const pageAccessToken = await getDecryptedPageToken(connection.id)
        if (pageAccessToken) {
          diagnostics.instagramSubscriptionStatus = await checkInstagramWebhookSubscription(
            connection.igBusinessId,
            pageAccessToken
          )
          if (diagnostics.instagramSubscriptionStatus?.subscribed) {
            diagnostics.metaConsoleChecklist.instagramWebhookConfigured = true
          } else {
            diagnostics.warnings.push('Instagram Business Account is not subscribed to webhooks. Instagram DMs will NOT be received.')
            diagnostics.warnings.push('⚠️ CRITICAL: Instagram webhook subscription is required for receiving Instagram DMs.')
          }
        } else {
          diagnostics.errors.push('Failed to decrypt page access token. Cannot check Instagram subscription status.')
        }
      } catch (error: any) {
        diagnostics.warnings.push(`Failed to check Instagram subscription status: ${error.message}`)
        diagnostics.warnings.push('This may indicate that API-based subscription is not supported. Manual setup in Meta Developer Console may be required.')
      }
    } else {
      diagnostics.errors.push('Connection missing igBusinessId. Cannot check Instagram subscription status.')
    }

    // 4. Check webhook URL accessibility (healthcheck)
    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)
    diagnostics.metaConsoleChecklist.webhookUrl = webhookUrl
    
    try {
      // Only attempt healthcheck if URL is absolute (starts with http/https)
      if (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://')) {
        // Test if webhook endpoint is reachable
        const healthcheckResponse = await fetch(webhookUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })
        
        if (healthcheckResponse.status === 200) {
          const healthcheckData = await healthcheckResponse.json()
          diagnostics.webhookUrlAccessibility = {
            reachable: true,
            status: healthcheckResponse.status,
            mode: healthcheckData.mode || 'unknown',
          }
        } else {
          diagnostics.webhookUrlAccessibility = {
            reachable: false,
            status: healthcheckResponse.status,
            error: `Webhook endpoint returned status ${healthcheckResponse.status}`,
          }
          diagnostics.warnings.push(`Webhook endpoint returned status ${healthcheckResponse.status}. This may be normal if the endpoint requires specific headers.`)
        }
      } else {
        // Relative URL - can't check externally, but log it
        diagnostics.webhookUrlAccessibility = {
          reachable: null,
          note: 'Relative URL - cannot check externally. Ensure this URL is publicly accessible.',
        }
        diagnostics.warnings.push('Webhook URL is relative. Ensure it resolves to a publicly accessible absolute URL in Meta Developer Console.')
      }
    } catch (error: any) {
      diagnostics.webhookUrlAccessibility = {
        reachable: false,
        error: error.message,
      }
      diagnostics.warnings.push(`Webhook endpoint healthcheck failed: ${error.message}. This may be normal if the endpoint is behind authentication or firewall.`)
    }

    // 5. Check verify token configuration
    const verifyToken = await getWebhookVerifyToken()
    diagnostics.verifyTokenConfigured = !!verifyToken
    diagnostics.verifyToken = verifyToken
    diagnostics.metaConsoleChecklist.verifyTokenMatches = !!verifyToken // User must verify manually

    // 6. Provide Meta Developer Console checklist
    if (!diagnostics.metaConsoleChecklist.instagramWebhookConfigured) {
      diagnostics.warnings.push('⚠️ MANUAL SETUP REQUIRED:')
      diagnostics.warnings.push('  1. Go to Meta Developers → Your App → Instagram → Webhooks')
      diagnostics.warnings.push(`  2. Add Webhook URL: ${webhookUrl}`)
      diagnostics.warnings.push(`  3. Set Verify Token: ${verifyToken || '[Your configured token]'}`)
      diagnostics.warnings.push('  4. Subscribe to: messages, messaging_postbacks')
      diagnostics.warnings.push('  5. Click "Verify and Save"')
    }

    return NextResponse.json(diagnostics)
  } catch (error: any) {
    console.error('Meta diagnostics error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to run diagnostics', 
        details: error.message,
        errors: [error.message],
        warnings: [],
      },
      { status: 500 }
    )
  }
}

