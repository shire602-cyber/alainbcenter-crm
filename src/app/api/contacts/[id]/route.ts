import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/contacts/[id]
 * Update contact fields (localSponsorName, companyName, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const contactId = parseInt(resolvedParams.id)
    
    if (isNaN(contactId)) {
      return NextResponse.json(
        { error: 'Invalid contact ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const updateData: any = {}

    if (body.localSponsorName !== undefined) {
      updateData.localSponsorName = body.localSponsorName || null
    }

    if (body.companyName !== undefined) {
      updateData.companyName = body.companyName || null
    }

    if (body.fullName !== undefined) {
      updateData.fullName = body.fullName
    }

    if (body.email !== undefined) {
      updateData.email = body.email || null
    }

    if (body.nationality !== undefined) {
      updateData.nationality = body.nationality || null
    }

    if (body.phone !== undefined) {
      updateData.phone = body.phone || null
    }

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    })

    return NextResponse.json(contact)
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      )
    }
    
    console.error('PATCH /api/contacts/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update contact' },
      { status: error.statusCode || 500 }
    )
  }
}
