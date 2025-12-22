import { notFound } from 'next/navigation'
import LeadDetailPagePremium from './LeadDetailPagePremium'

export default async function Page({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await Promise.resolve(params)
  const leadIdParam = resolvedParams.id
  
  if (!leadIdParam || typeof leadIdParam !== 'string') {
    notFound()
  }

  const leadId = parseInt(leadIdParam, 10)

  if (isNaN(leadId) || leadId <= 0) {
    notFound()
  }

  return <LeadDetailPagePremium leadId={leadId} />
}

