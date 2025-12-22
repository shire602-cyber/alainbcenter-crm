import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH /api/checklist/[itemId]
// Update a checklist item (mark as completed/uncompleted)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const resolvedParams = await params
    const itemId = parseInt(resolvedParams.itemId)
    
    if (isNaN(itemId)) {
      return NextResponse.json(
        { error: 'Invalid checklist item ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Build update data
    const updateData: any = {}

    if (body.completed !== undefined) {
      const completed = Boolean(body.completed)
      updateData.completed = completed
      updateData.completedAt = completed ? new Date() : null
    }

    // Update checklist item
    const checklistItem = await prisma.checklistItem.update({
      where: { id: itemId },
      data: updateData,
    })

    return NextResponse.json(checklistItem)
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Checklist item not found' },
        { status: 404 }
      )
    }
    
    console.error('PATCH /api/checklist/[itemId] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error updating checklist item' },
      { status: 500 }
    )
  }
}

