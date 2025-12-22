import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    const body = await req.json()
    
    const updateData: any = {}
    if ('isActive' in body) updateData.isActive = body.isActive
    
    const rule = await prisma.automationRule.update({
      where: { id },
      data: updateData,
    })
    
    return NextResponse.json(rule)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update rule' },
      { status: error.statusCode || 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)

    await prisma.automationRule.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete rule' },
      { status: error.statusCode || 500 }
    )
  }
}
