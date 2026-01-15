import { NextRequest, NextResponse } from 'next/server'
import { checkMetaLeadgenReadiness, fetchLeadgenForms, fetchLeadgenIdsForForm, processLeadgenEvent } from '@/server/integrations/meta/leadgen'
import { getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { prisma } from '@/lib/prisma'

const CRON_SECRET = process.env.CRON_SECRET || 'change-me-in-production'

export async function GET(req: NextRequest) {
  try {
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization') || ''
    const tokenQuery = req.nextUrl.searchParams.get('token')
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null

    const isVercelCron = !!vercelCronHeader
    const isSecretOk = (bearer && bearer === CRON_SECRET) || (tokenQuery && tokenQuery === CRON_SECRET)

    if (!isVercelCron && !isSecretOk) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const readiness = await checkMetaLeadgenReadiness()
    if (!readiness.ok || !readiness.connection || !readiness.selectedPageId) {
      return NextResponse.json({
        ok: false,
        error: 'Meta Leadgen not ready',
        missing: readiness.missing,
      })
    }

    if (readiness.state.pollerEnabled === false) {
      return NextResponse.json({ ok: false, error: 'Poller disabled' })
    }

    const pageToken = await getDecryptedPageToken(readiness.connection.id)
    if (!pageToken) {
      return NextResponse.json({ ok: false, error: 'Missing page token' }, { status: 500 })
    }

    const since = readiness.state.lastPollAt ? readiness.state.lastPollAt.toISOString() : null
    console.log('[LEADGEN-POLL-START]', { workspaceId: 1, since })

    let formIds: string[] = []
    if (readiness.state.selectedFormIds) {
      try {
        formIds = JSON.parse(readiness.state.selectedFormIds)
      } catch {
        formIds = []
      }
    }

    if (formIds.length === 0) {
      const forms = await fetchLeadgenForms(readiness.selectedPageId, pageToken)
      formIds = forms.map((form) => form.id)
    }

    let scanned = 0
    let newProcessed = 0
    let deduped = 0
    let errors = 0

    for (const formId of formIds) {
      const leads = await fetchLeadgenIdsForForm(formId, pageToken, since)
      for (const lead of leads) {
        scanned += 1
        try {
          const result = await processLeadgenEvent({
            payload: {
              leadgenId: lead.id,
              formId: lead.form_id || formId,
              adId: lead.ad_id || null,
              pageId: readiness.selectedPageId,
              createdTime: lead.created_time ? Date.parse(lead.created_time) / 1000 : null,
            },
            source: 'poller',
          })
          if (result?.deduped) {
            deduped += 1
          } else {
            newProcessed += 1
          }
        } catch (error: any) {
          errors += 1
          console.error('[LEADGEN-POLL] Error processing lead', {
            leadgenId: lead.id,
            error: error.message,
          })
        }
      }
    }

    await prisma.metaLeadgenState.update({
      where: { workspaceId: 1 },
      data: {
        lastPollAt: new Date(),
        lastPollRunAt: new Date(),
        lastPollCursor: since ? JSON.stringify({ since }) : null,
        selectedFormIds: JSON.stringify(formIds),
      },
    })

    console.log('[LEADGEN-POLL-SUMMARY]', {
      scanned,
      newProcessed,
      deduped,
      errors,
    })

    return NextResponse.json({
      ok: true,
      scanned,
      newProcessed,
      deduped,
      errors,
    })
  } catch (error: any) {
    console.error('[LEADGEN-POLL] Error:', error)
    return NextResponse.json({ ok: false, error: error.message || 'Poll failed' }, { status: 500 })
  }
}
