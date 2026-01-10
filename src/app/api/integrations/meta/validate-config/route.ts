/**
 * POST /api/integrations/meta/validate-config
 * Validate Meta Developer Console configuration matches expected values
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getWebhookUrl } from '@/lib/publicUrl'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { webhookUrl: providedUrl, verifyToken: providedToken } = body

    const expectedVerifyToken = await getWebhookVerifyToken()
    const expectedWebhookUrl = getWebhookUrl('/api/webhooks/meta', req)

    const validationResults = {
      webhookUrl: {
        provided: providedUrl || null,
        expected: expectedWebhookUrl,
        matches: false,
        errors: [] as string[],
        warnings: [] as string[],
      },
      verifyToken: {
        provided: providedToken || null,
        expected: expectedVerifyToken || null,
        matches: false,
        errors: [] as string[],
        warnings: [] as string[],
      },
    }

    // Validate webhook URL
    if (!providedUrl) {
      validationResults.webhookUrl.errors.push('Webhook URL not provided')
    } else {
      // Normalize URLs for comparison (remove trailing slashes, convert to lowercase)
      const normalizedProvided = providedUrl.trim().replace(/\/$/, '').toLowerCase()
      const normalizedExpected = expectedWebhookUrl.trim().replace(/\/$/, '').toLowerCase()

      if (normalizedProvided === normalizedExpected) {
        validationResults.webhookUrl.matches = true
      } else {
        validationResults.webhookUrl.errors.push('Webhook URL does not match expected value')
        
        // Check for common issues
        if (!providedUrl.startsWith('https://')) {
          validationResults.webhookUrl.errors.push('Webhook URL must use HTTPS (not HTTP)')
        }
        if (providedUrl.includes('localhost') || providedUrl.includes('127.0.0.1')) {
          validationResults.webhookUrl.errors.push('Webhook URL cannot be localhost - Meta cannot reach localhost URLs')
        }
        if (!providedUrl.includes('/api/webhooks/meta')) {
          validationResults.webhookUrl.errors.push('Webhook URL must end with /api/webhooks/meta')
        }
        if (providedUrl !== providedUrl.trim()) {
          validationResults.webhookUrl.warnings.push('Webhook URL has leading/trailing whitespace')
        }
      }
    }

    // Validate verify token
    if (!providedToken) {
      validationResults.verifyToken.errors.push('Verify token not provided')
    } else if (!expectedVerifyToken) {
      validationResults.verifyToken.errors.push('Verify token not configured in system')
    } else {
      // Token comparison is case-sensitive
      if (providedToken.trim() === expectedVerifyToken.trim()) {
        validationResults.verifyToken.matches = true
      } else {
        validationResults.verifyToken.errors.push('Verify token does not match expected value (case-sensitive)')
        
        // Check for common issues
        if (providedToken.toLowerCase() === expectedVerifyToken.toLowerCase()) {
          validationResults.verifyToken.warnings.push('Token case mismatch - verify tokens are case-sensitive')
        }
        if (providedToken !== providedToken.trim()) {
          validationResults.verifyToken.warnings.push('Verify token has leading/trailing whitespace')
        }
        if (providedToken.length !== expectedVerifyToken.length) {
          validationResults.verifyToken.errors.push(`Token length mismatch: provided ${providedToken.length} chars, expected ${expectedVerifyToken.length} chars`)
        }
      }
    }

    // Overall validation status
    const allValid =
      validationResults.webhookUrl.matches &&
      validationResults.verifyToken.matches &&
      validationResults.webhookUrl.errors.length === 0 &&
      validationResults.verifyToken.errors.length === 0

    // Test webhook accessibility
    let webhookAccessible = false
    let accessibilityError = null
    if (providedUrl) {
      try {
        const testResponse = await fetch(providedUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Meta-Config-Validator',
          },
        })
        webhookAccessible = testResponse.ok
      } catch (error: any) {
        accessibilityError = error.message
        webhookAccessible = false
      }
    }

    return NextResponse.json({
      success: true,
      validationPassed: allValid,
      webhookAccessible,
      accessibilityError,
      validationResults,
      expectedValues: {
        webhookUrl: expectedWebhookUrl,
        verifyToken: expectedVerifyToken || 'NOT CONFIGURED',
      },
      summary: allValid
        ? '✅ Configuration is valid - values match expected configuration'
        : '❌ Configuration has errors - please fix the issues below',
      nextSteps: allValid
        ? [
            'Configuration is correct. Make sure in Meta Developer Console:',
            '1. Both values are entered exactly as shown in "Expected Values"',
            '2. Click "Verify and Save" in Meta Console',
            '3. Subscribe to fields: messages, messaging_postbacks',
            '4. Webhook should start receiving events after verification',
          ]
        : [
            'Fix the configuration errors listed above',
            'Copy the exact values from "Expected Values" section',
            'Paste them into Meta Developer Console → Instagram → Webhooks',
            'Make sure there are no extra spaces or typos',
            'Click "Verify and Save" after fixing',
          ],
    })
  } catch (error: any) {
    console.error('Validate config error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}

