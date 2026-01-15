// Shared constants for pipeline stages and lead sources
// Used across frontend and backend to ensure consistency

export const PIPELINE_STAGES = [
  'new',
  'contacted',
  'qualified',
  'docs_pending',
  'submitted',
  'completed',
  'won',
  'lost',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  docs_pending: 'Docs Pending',
  submitted: 'Submitted',
  completed: 'Completed',
  won: 'Won',
  lost: 'Lost',
}

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, string> = {
  new: 'bg-gray-100 text-gray-800',
  contacted: 'bg-blue-100 text-blue-800',
  qualified: 'bg-green-100 text-green-800',
  docs_pending: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-purple-100 text-purple-800',
  completed: 'bg-emerald-100 text-emerald-800',
  won: 'bg-amber-100 text-amber-800',
  lost: 'bg-red-100 text-red-800',
}

export const LEAD_SOURCES = [
  'website',
  'facebook_ad',
  'instagram_ad',
  'whatsapp',
  'manual',
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  facebook_ad: 'Facebook Ads',
  instagram_ad: 'Instagram Ads',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
}

// AI Score categories (returns lowercase to match Badge component variants)
export const getAiScoreCategory = (score: number | null): 'hot' | 'warm' | 'cold' => {
  if (score === null) return 'cold'
  if (score >= 75) return 'hot'
  if (score >= 40) return 'warm'
  return 'cold'
}

export const AI_SCORE_COLORS = {
  HOT: 'bg-red-100 text-red-800 border-red-300',
  WARM: 'bg-orange-100 text-orange-800 border-orange-300',
  COLD: 'bg-gray-100 text-gray-800 border-gray-300',
}

