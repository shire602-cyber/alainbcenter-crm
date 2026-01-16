import { PrismaClient } from '@prisma/client'
import { decryptToken } from '@/lib/integrations/meta/encryption'
import { graphAPIGet } from '@/server/integrations/meta/graph'
import { checkPageWebhookSubscription } from '@/server/integrations/meta/subscribe'

type CheckStatus = 'pass' | 'fail' | 'warn' | 'info'

type CheckResult = {
  id: string
  status: CheckStatus
  message: string
  details?: Record<string, any>
}

type DiagnosticReport = {
  generatedAt: string
  summary: {
    pass: number
    fail: number
    warn: number
    info: number
  }
  results: CheckResult[]
}

function pushResult(results: CheckResult[], result: CheckResult) {
  results.push(result)
  const label = result.status.toUpperCase()
  const details = result.details ? ` ${JSON.stringify(result.details)}` : ''
  console.log(`[${label}] ${result.message}${details}`)
}

function summarize(results: CheckResult[]): DiagnosticReport['summary'] {
  return results.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { pass: 0, fail: 0, warn: 0, info: 0 }
  )
}

async function runDiagnostics() {
  const results: CheckResult[] = []

  const databaseUrl =
    process.env.META_DIAGNOSTICS_DATABASE_URL || process.env.DATABASE_URL || ''

  if (!databaseUrl) {
    pushResult(results, {
      id: 'database-url',
      status: 'fail',
      message: 'DATABASE_URL is not set for diagnostics',
    })
    return buildReport(results)
  }

  process.env.DATABASE_URL = databaseUrl

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  })

  const requiredEnv = ['META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_APP_ID']
  const missingEnv = requiredEnv.filter((key) => !process.env[key])
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI

  if (missingEnv.length > 0) {
    pushResult(results, {
      id: 'env-vars',
      status: 'fail',
      message: 'Missing required Meta environment variables',
      details: { missing: missingEnv },
    })
  } else {
    pushResult(results, {
      id: 'env-vars',
      status: 'pass',
      message: 'Meta environment variables present',
    })
  }

  if (!redirectUri) {
    pushResult(results, {
      id: 'oauth-redirect',
      status: 'fail',
      message: 'META_OAUTH_REDIRECT_URI or META_REDIRECT_URI not configured',
    })
  } else {
    pushResult(results, {
      id: 'oauth-redirect',
      status: 'pass',
      message: 'OAuth redirect URI configured',
      details: { redirectUri },
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || null
  if (!baseUrl) {
    pushResult(results, {
      id: 'public-url',
      status: 'warn',
      message: 'NEXT_PUBLIC_APP_URL or APP_PUBLIC_URL not set (webhook URL may be unstable)',
    })
  } else {
    pushResult(results, {
      id: 'public-url',
      status: 'pass',
      message: 'Public URL configured',
      details: { webhookUrl: `${baseUrl.replace(/\/$/, '')}/api/webhooks/meta-leads` },
    })
  }

  if (process.env.META_DIAGNOSTICS_RESUBSCRIBE === 'true') {
    const diagnosticsBaseUrl = process.env.META_DIAGNOSTICS_BASE_URL || baseUrl
    const adminSession = process.env.META_DIAGNOSTICS_ADMIN_SESSION || ''

    if (!diagnosticsBaseUrl) {
      pushResult(results, {
        id: 'resubscribe',
        status: 'warn',
        message: 'Resubscribe requested but no base URL provided',
      })
    } else if (!adminSession) {
      pushResult(results, {
        id: 'resubscribe',
        status: 'warn',
        message: 'Resubscribe requested but META_DIAGNOSTICS_ADMIN_SESSION is missing',
      })
    } else {
      try {
        const subscribeUrl = `${diagnosticsBaseUrl.replace(/\/$/, '')}/api/integrations/meta/subscribe`
        const res = await fetch(subscribeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `alaincrm_session=${adminSession}`,
          },
          body: JSON.stringify({}),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.ok) {
          pushResult(results, {
            id: 'resubscribe',
            status: 'pass',
            message: 'Webhook re-subscribe request succeeded',
            details: { pageId: data.pageId || null },
          })
        } else {
          pushResult(results, {
            id: 'resubscribe',
            status: 'fail',
            message: 'Webhook re-subscribe request failed',
            details: { status: res.status, error: data?.error || 'unknown' },
          })
        }
      } catch (error: any) {
        pushResult(results, {
          id: 'resubscribe',
          status: 'warn',
          message: 'Webhook re-subscribe request errored',
          details: { error: error.message },
        })
      }
    }
  }

  const connection = await prisma.metaConnection.findFirst({
    where: { status: 'connected' },
    orderBy: { createdAt: 'desc' },
  })

  if (!connection) {
    pushResult(results, {
      id: 'meta-connection',
      status: 'fail',
      message: 'No active Meta connection found',
    })
  } else {
    pushResult(results, {
      id: 'meta-connection',
      status: 'pass',
      message: 'Active Meta connection found',
      details: {
        pageId: connection.pageId,
        pageName: connection.pageName || null,
        triggerSubscribed: connection.triggerSubscribed,
      },
    })
  }

  if (connection?.pageAccessToken) {
    try {
      decryptToken(connection.pageAccessToken)
      pushResult(results, {
        id: 'page-token',
        status: 'pass',
        message: 'Page access token decrypted successfully',
      })
    } catch (error: any) {
      pushResult(results, {
        id: 'page-token',
        status: 'fail',
        message: 'Failed to decrypt page access token',
        details: { error: error.message },
      })
    }
  }

  if (connection?.metaUserAccessTokenLong) {
    try {
      decryptToken(connection.metaUserAccessTokenLong)
      pushResult(results, {
        id: 'user-token',
        status: 'pass',
        message: 'User access token decrypted successfully',
      })
    } catch (error: any) {
      pushResult(results, {
        id: 'user-token',
        status: 'fail',
        message: 'Failed to decrypt user access token',
        details: { error: error.message },
      })
    }
  }

  if (connection?.metaUserTokenExpiresAt) {
    const expiresAt = new Date(connection.metaUserTokenExpiresAt)
    if (expiresAt.getTime() < Date.now()) {
      pushResult(results, {
        id: 'token-expiry',
        status: 'fail',
        message: 'Meta user token is expired',
        details: { expiresAt: expiresAt.toISOString() },
      })
    } else {
      pushResult(results, {
        id: 'token-expiry',
        status: 'pass',
        message: 'Meta user token is valid',
        details: { expiresAt: expiresAt.toISOString() },
      })
    }
  }

  const state = await prisma.metaLeadgenState.findUnique({
    where: { workspaceId: 1 },
  })

  if (!state) {
    pushResult(results, {
      id: 'leadgen-state',
      status: 'fail',
      message: 'MetaLeadgenState is missing',
    })
  } else {
    pushResult(results, {
      id: 'leadgen-state',
      status: 'pass',
      message: 'MetaLeadgenState found',
      details: {
        selectedPageId: state.selectedPageId || null,
        webhookSubscribedAt: state.webhookSubscribedAt?.toISOString() || null,
        lastLeadgenReceivedAt: state.lastLeadgenReceivedAt?.toISOString() || null,
        lastLeadgenProcessedAt: state.lastLeadgenProcessedAt?.toISOString() || null,
      },
    })
  }

  if (connection?.pageId && connection?.pageAccessToken) {
    try {
      const pageToken = decryptToken(connection.pageAccessToken)
      const subscription = await checkPageWebhookSubscription(connection.pageId, pageToken)
      if (subscription?.subscribed) {
        pushResult(results, {
          id: 'webhook-subscription',
          status: 'pass',
          message: 'Page webhook subscription verified via Graph API',
          details: { fields: subscription.fields },
        })
      } else if (subscription) {
        pushResult(results, {
          id: 'webhook-subscription',
          status: 'fail',
          message: 'Page webhook subscription is missing',
          details: { fields: subscription.fields },
        })
      } else {
        pushResult(results, {
          id: 'webhook-subscription',
          status: 'warn',
          message: 'Unable to verify webhook subscription via Graph API',
        })
      }
    } catch (error: any) {
      pushResult(results, {
        id: 'webhook-subscription',
        status: 'warn',
        message: 'Webhook subscription check failed',
        details: { error: error.message },
      })
    }
  }

  if (connection?.metaUserId && connection?.metaUserAccessTokenLong) {
    try {
      const userToken = decryptToken(connection.metaUserAccessTokenLong)
      const permissions = await graphAPIGet<{ data: Array<{ permission: string; status: string }> }>(
        `/${connection.metaUserId}/permissions`,
        userToken
      )
      const hasLeadsRetrieval = permissions.data.some(
        (perm) => perm.permission === 'leads_retrieval' && perm.status === 'granted'
      )
      if (hasLeadsRetrieval) {
        pushResult(results, {
          id: 'leads-retrieval',
          status: 'pass',
          message: 'leads_retrieval permission granted',
        })
      } else {
        pushResult(results, {
          id: 'leads-retrieval',
          status: 'fail',
          message: 'leads_retrieval permission missing',
        })
      }
    } catch (error: any) {
      pushResult(results, {
        id: 'leads-retrieval',
        status: 'warn',
        message: 'Unable to verify leads_retrieval permission',
        details: { error: error.message },
      })
    }
  }

  const recentErrors = await prisma.externalEventLog.findMany({
    where: { provider: 'meta', eventType: 'leadgen', status: 'error' },
    orderBy: { receivedAt: 'desc' },
    take: 5,
  })

  if (recentErrors.length > 0) {
    pushResult(results, {
      id: 'leadgen-errors',
      status: 'fail',
      message: 'Recent leadgen errors found',
      details: {
        errors: recentErrors.map((err) => ({
          leadgenId: err.externalId,
          error: err.error,
          receivedAt: err.receivedAt,
        })),
      },
    })
  } else {
    pushResult(results, {
      id: 'leadgen-errors',
      status: 'pass',
      message: 'No recent leadgen errors detected',
    })
  }

  await prisma.$disconnect()

  return buildReport(results)
}

function buildReport(results: CheckResult[]): DiagnosticReport {
  return {
    generatedAt: new Date().toISOString(),
    summary: summarize(results),
    results,
  }
}

async function main() {
  const report = await runDiagnostics()
  console.log('\nMeta Leads Diagnostics Report')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error('Diagnostics failed:', error)
  process.exit(1)
})
