import { describe, it, expect } from 'vitest'
import { POST } from '../src/app/api/webhooks/meta-leads/route'
import {
  buildLeadgenWebhookPayload,
  buildMetaWebhookRequest,
} from '../helpers/metaLeadsTestHelpers'

describe('Meta Leads - Webhook Endpoint Behavior', () => {
  it('rejects invalid signatures', async () => {
    const appSecret = process.env.META_APP_SECRET
    expect(appSecret, 'META_APP_SECRET must be set').toBeTruthy()
    if (!appSecret) return

    const payload = buildLeadgenWebhookPayload({
      leadgenId: `leadgen_invalid_${Date.now()}`,
      pageId: 'page_test',
    })

    const request = buildMetaWebhookRequest({
      url: 'http://localhost/api/webhooks/meta-leads',
      payload,
      signatureOverride: 'sha256=invalid',
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('accepts missing signatures (legacy behavior)', async () => {
    const appSecret = process.env.META_APP_SECRET
    expect(appSecret, 'META_APP_SECRET must be set').toBeTruthy()
    if (!appSecret) return

    const payload = buildLeadgenWebhookPayload({
      leadgenId: `leadgen_missing_sig_${Date.now()}`,
      pageId: 'page_test',
    })

    const request = buildMetaWebhookRequest({
      url: 'http://localhost/api/webhooks/meta-leads',
      payload,
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  it('returns error payload for malformed JSON', async () => {
    const request = new Request('http://localhost/api/webhooks/meta-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json}',
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(false)
  })
})
