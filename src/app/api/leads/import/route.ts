import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { ingestLead } from '@/lib/leadIngest'
import { normalizeService } from '@/lib/services/normalizeService'

const parseCsvDate = (value: string | undefined | null): Date | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map(part => part.trim())
    if (parts.length === 3) {
      const day = Number(parts[0])
      const month = Number(parts[1])
      const year = Number(parts[2])
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
        const parsed = new Date(year, month - 1, day)
        if (!isNaN(parsed.getTime())) {
          return parsed
        }
      }
    }
  }

  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map(part => part.trim())
    if (parts.length === 3 && parts[0].length === 4) {
      const year = Number(parts[0])
      const month = Number(parts[1])
      const day = Number(parts[2])
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
        const parsed = new Date(year, month - 1, day)
        if (!isNaN(parsed.getTime())) {
          return parsed
        }
      }
    }
  }

  const fallback = new Date(trimmed)
  return isNaN(fallback.getTime()) ? null : fallback
}

const mapServiceToExpiryType = (serviceInput?: string | null): string | null => {
  if (!serviceInput) return null
  const normalized = normalizeService(serviceInput)

  switch (normalized.service) {
    case 'VISIT_VISA':
      return 'VISIT_VISA_EXPIRY'
    case 'EMIRATES_ID':
      return 'EMIRATES_ID_EXPIRY'
    case 'MAINLAND_BUSINESS_SETUP':
    case 'FREEZONE_BUSINESS_SETUP':
    case 'OFFSHORE_COMPANY':
    case 'BRANCH_SUBSIDIARY_SETUP':
    case 'PRO_SERVICES':
    case 'ACCOUNTING_VAT_SERVICES':
    case 'BANK_ACCOUNT_ASSISTANCE':
      return 'TRADE_LICENSE_EXPIRY'
    case 'FAMILY_VISA':
    case 'GOLDEN_VISA':
    case 'FREELANCE_VISA':
    case 'EMPLOYMENT_VISA':
    case 'VISA_RENEWAL':
    case 'INVESTOR_PARTNER_VISA':
    case 'DOMESTIC_WORKER_VISA':
    case 'STATUS_CHANGE_INSIDE_UAE':
    case 'MEDICAL_BIOMETRICS':
      return 'VISA_EXPIRY'
    case 'OTHER':
    default:
      return serviceInput ? 'VISA_EXPIRY' : null
  }
}

/**
 * POST /api/leads/import
 * Admin-only CSV import endpoint
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must have header row and at least one data row' },
        { status: 400 }
      )
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'fullname')
    const phoneIdx = headers.findIndex(h => h === 'phone' || h === 'mobile')
    const emailIdx = headers.findIndex(h => h === 'email')
    const nationalityIdx = headers.findIndex(h => h === 'nationality')
    const serviceIdx = headers.findIndex(h => h === 'service' || h === 'servicetype')
    const expiryDateIdx = headers.findIndex(h => h === 'expiry date' || h === 'expiry_date' || h === 'expirydate')
    const stageIdx = headers.findIndex(h => h === 'stage' || h === 'pipelinestage')
    const sourceIdx = headers.findIndex(h => h === 'source')
    const notesIdx = headers.findIndex(h => h === 'notes' || h === 'note')

    if (nameIdx === -1 || phoneIdx === -1) {
      return NextResponse.json(
        { error: 'CSV must have "name" and "phone" columns' },
        { status: 400 }
      )
    }

    // Parse data rows
    const results = {
      total: lines.length - 1,
      created: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; error: string }>,
      preview: [] as Array<{ name: string; phone: string; email?: string; willCreate: boolean; reason?: string }>,
    }

    // Get service types for mapping
    const serviceTypes = await prisma.serviceType.findMany({
      select: { id: true, name: true },
    })

    const serviceTypeMap = new Map(
      serviceTypes.map(st => [st.name.toLowerCase(), st.id])
    )

    // Preview mode: validate first 10 rows
    const previewRows = Math.min(10, lines.length - 1)
    for (let i = 1; i <= previewRows; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const name = values[nameIdx]?.trim()
      const phone = values[phoneIdx]?.trim()
      const email = values[emailIdx]?.trim() || undefined
      const expiryValue = expiryDateIdx >= 0 ? values[expiryDateIdx]?.trim() : undefined
      const parsedExpiry = parseCsvDate(expiryValue)

      if (!name || !phone) {
        results.preview.push({
          name: name || 'N/A',
          phone: phone || 'N/A',
          email,
          willCreate: false,
          reason: 'Missing name or phone',
        })
        continue
      }

      if (expiryValue && !parsedExpiry) {
        results.preview.push({
          name,
          phone,
          email,
          willCreate: false,
          reason: 'Invalid expiry date',
        })
        continue
      }

      // Normalize phone (remove non-digits except +)
      const normalizedPhone = phone.replace(/[^\d+]/g, '')
      if (normalizedPhone.length < 10) {
        results.preview.push({
          name,
          phone,
          email,
          willCreate: false,
          reason: 'Invalid phone number',
        })
        continue
      }

      results.preview.push({
        name,
        phone: normalizedPhone,
        email,
        willCreate: true,
      })
    }

    // If this is just a preview request, return preview
    const { searchParams } = new URL(req.url)
    const isPreview = searchParams.get('preview') === 'true'
    if (isPreview) {
      return NextResponse.json({
        ok: true,
        preview: results.preview,
        totalRows: lines.length - 1,
        willCreate: results.preview.filter(p => p.willCreate).length,
        willSkip: results.preview.filter(p => !p.willCreate).length,
      })
    }

    // Actual import
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        const name = values[nameIdx]?.trim()
        const phone = values[phoneIdx]?.trim()
        const email = values[emailIdx]?.trim() || undefined
        const nationality = values[nationalityIdx]?.trim() || undefined
        const serviceName = values[serviceIdx]?.trim()
        const stage = values[stageIdx]?.trim() || undefined
        const source = values[sourceIdx]?.trim() || 'manual'
        const notes = values[notesIdx]?.trim() || undefined
        const expiryValue = expiryDateIdx >= 0 ? values[expiryDateIdx]?.trim() : undefined
        const parsedExpiry = parseCsvDate(expiryValue)

        if (!name || !phone) {
          results.skipped++
          results.errors.push({ row: i + 1, error: 'Missing name or phone' })
          continue
        }

        if (expiryValue && !parsedExpiry) {
          results.skipped++
          results.errors.push({ row: i + 1, error: 'Invalid expiry date' })
          continue
        }

        // Normalize phone
        const normalizedPhone = phone.replace(/[^\d+]/g, '')
        if (normalizedPhone.length < 10) {
          results.skipped++
          results.errors.push({ row: i + 1, error: 'Invalid phone number' })
          continue
        }

        // Map service name to ID
        let serviceTypeId: number | undefined
        if (serviceName) {
          serviceTypeId = serviceTypeMap.get(serviceName.toLowerCase())
        }

        // Use ingestLead to create (handles duplicates)
        const ingestResult = await ingestLead({
          fullName: name,
          phone: normalizedPhone,
          email,
          nationality,
          serviceTypeId,
          source: source as any,
          notes,
          expiryDate: parsedExpiry ? parsedExpiry.toISOString() : undefined,
          // Note: pipelineStage is not supported in ingestLead, will need to update lead separately if needed
        })

        if (parsedExpiry) {
          const expiryType = mapServiceToExpiryType(serviceName)
          if (expiryType) {
            const existingExpiry = await prisma.expiryItem.findFirst({
              where: {
                leadId: ingestResult.lead.id,
                expiryDate: parsedExpiry,
                type: expiryType,
              },
            })

            if (!existingExpiry) {
              await prisma.expiryItem.create({
                data: {
                  contactId: ingestResult.contact.id,
                  leadId: ingestResult.lead.id,
                  type: expiryType,
                  expiryDate: parsedExpiry,
                  notes: notes || null,
                },
              })
            }
          }
        }

        // If stage was provided, update it after creation
        if (stage) {
          // Find the lead we just created (by phone)
          const createdLead = await prisma.lead.findFirst({
            where: {
              contact: {
                phone: normalizedPhone,
              },
            },
            orderBy: { createdAt: 'desc' },
          })
          if (createdLead) {
            await prisma.lead.update({
              where: { id: createdLead.id },
              data: { pipelineStage: stage },
            })
          }
        }

        results.created++
      } catch (error: any) {
        results.skipped++
        results.errors.push({
          row: i + 1,
          error: error.message || 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      results,
    })
  } catch (error: any) {
    console.error('POST /api/leads/import error:', error)
    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: error?.message ?? 'Failed to import leads' },
      { status: 500 }
    )
  }
}

