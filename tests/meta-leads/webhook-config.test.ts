import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '../src/app/api/webhooks/meta-leads/route'
import {
  buildLeadgenWebhookPayload,
  buildMetaWebhookRequest,
} from '../helpers/metaLeadsTestHelpers'

describe('Meta Leads - Webhook Configuration', () => {
  it('verifies webhook token via GET endpoint', async () => {
    const verifyToken = process.env.META_VERIFY_TOKEN
    expect(verifyToken, 'META_VERIFY_TOKEN must be set').toBeTruthy()
    if (!verifyToken) return

    const challenge = 'meta-challenge-test'
    const url = `http://localhost/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
      verifyToken
    )}&hub.challenge=${encodeURIComponent(challenge)}`

    const request = new NextRequest(url)
    const response = await GET(request)
    expect(response.status).toBe(200)

    const text = await response.text()
    expect(text).toBe(challenge)
  })

  it('accepts signed webhook payloads', async () => {
    const appSecret = process.env.META_APP_SECRET
    expect(appSecret, 'META_APP_SECRET must be set').toBeTruthy()
    if (!appSecret) return

    const payload = buildLeadgenWebhookPayload({
      leadgenId: `leadgen_${Date.now()}`,
      pageId: 'page_test',
      formId: 'form_test',
      adId: 'ad_test',
    })

    const request = buildMetaWebhookRequest({
      url: 'http://localhost/api/webhooks/meta-leads',
      payload,
      appSecret,
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })
})
