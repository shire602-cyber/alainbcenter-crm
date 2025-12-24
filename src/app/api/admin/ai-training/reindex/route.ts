/**
 * POST /api/admin/ai-training/reindex
 * Re-index all training documents in the vector store
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { reindexAllTrainingDocuments } from '@/lib/ai/vectorStore'

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    console.log('🔄 Starting re-index of all training documents...')
    await reindexAllTrainingDocuments()

    return NextResponse.json({
      ok: true,
      message: 'All training documents re-indexed successfully',
    })
  } catch (error: any) {
    console.error('Re-index error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to re-index documents' },
      { status: 500 }
    )
  }
}

