'use client'

import { useState, useEffect } from 'react'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Bot, Plus, Trash2, Save, Settings, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface AIAgentProfile {
  id: number
  name: string
  description: string | null
  isActive: boolean
  isDefault: boolean
  trainingDocumentIds: string | null
  systemPrompt: string | null
  tone: string
  maxMessageLength: number
  maxTotalLength: number
  maxQuestionsPerMessage: number
  allowedPhrases: string | null
  prohibitedPhrases: string | null
  customGreeting: string | null
  customSignoff: string | null
  responseDelayMin: number
  responseDelayMax: number
  rateLimitMinutes: number
  businessHoursStart: string
  businessHoursEnd: string
  timezone: string
  allowOutsideHours: boolean
  firstMessageImmediate: boolean
  similarityThreshold: number
  confidenceThreshold: number
  escalateToHumanRules: string | null
  skipAutoReplyRules: string | null
  defaultLanguage: string
  autoDetectLanguage: boolean
  createdAt: string
  updatedAt: string
}

interface TrainingDocument {
  id: number
  title: string
  type: string
}

interface ResponseSettingsTabProps {
  trainingDocuments: TrainingDocument[]
}

// Form data type with arrays for JSON fields
interface AgentFormData {
  name: string
  description: string
  isActive: boolean
  isDefault: boolean
  trainingDocumentIds: number[] // Array for form, converted to JSON string when saving
  systemPrompt: string
  tone: string
  maxMessageLength: number
  maxTotalLength: number
  maxQuestionsPerMessage: number
  allowedPhrases: string // Newline-separated for form, converted to JSON array when saving
  prohibitedPhrases: string
  customGreeting: string
  customSignoff: string
  responseDelayMin: number
  responseDelayMax: number
  rateLimitMinutes: number
  businessHoursStart: string
  businessHoursEnd: string
  timezone: string
  allowOutsideHours: boolean
  firstMessageImmediate: boolean
  similarityThreshold: number
  confidenceThreshold: number
  escalateToHumanRules: string // Newline-separated for form
  skipAutoReplyRules: string
  defaultLanguage: string
  autoDetectLanguage: boolean
}

export function ResponseSettingsTab({ trainingDocuments }: ResponseSettingsTabProps) {
  const { showToast } = useToast()
  const [agents, setAgents] = useState<AIAgentProfile[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AIAgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Form state
  const [formData, setFormData] = useState<Partial<AgentFormData>>({
    name: '',
    description: '',
    isActive: true,
    isDefault: false,
    tone: 'friendly',
    maxMessageLength: 300,
    maxTotalLength: 600,
    maxQuestionsPerMessage: 2,
    responseDelayMin: 0,
    responseDelayMax: 5,
    rateLimitMinutes: 2,
    businessHoursStart: '07:00',
    businessHoursEnd: '21:30',
    timezone: 'Asia/Dubai',
    allowOutsideHours: false,
    firstMessageImmediate: true,
    similarityThreshold: 0.7,
    confidenceThreshold: 50,
    defaultLanguage: 'en',
    autoDetectLanguage: true,
  })

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (selectedAgent) {
      // Parse JSON fields
      const trainingDocIds = selectedAgent.trainingDocumentIds
        ? JSON.parse(selectedAgent.trainingDocumentIds)
        : []
      const allowedPhrases = selectedAgent.allowedPhrases
        ? JSON.parse(selectedAgent.allowedPhrases).join('\n')
        : ''
      const prohibitedPhrases = selectedAgent.prohibitedPhrases
        ? JSON.parse(selectedAgent.prohibitedPhrases).join('\n')
        : ''
      const escalateRules = selectedAgent.escalateToHumanRules
        ? JSON.parse(selectedAgent.escalateToHumanRules).join('\n')
        : ''
      const skipRules = selectedAgent.skipAutoReplyRules
        ? JSON.parse(selectedAgent.skipAutoReplyRules).join('\n')
        : ''

      setFormData({
        name: selectedAgent.name,
        description: selectedAgent.description || '',
        isActive: selectedAgent.isActive,
        isDefault: selectedAgent.isDefault,
        trainingDocumentIds: trainingDocIds,
        systemPrompt: selectedAgent.systemPrompt || '',
        tone: selectedAgent.tone,
        maxMessageLength: selectedAgent.maxMessageLength,
        maxTotalLength: selectedAgent.maxTotalLength,
        maxQuestionsPerMessage: selectedAgent.maxQuestionsPerMessage,
        allowedPhrases,
        prohibitedPhrases,
        customGreeting: selectedAgent.customGreeting || '',
        customSignoff: selectedAgent.customSignoff || '',
        responseDelayMin: selectedAgent.responseDelayMin,
        responseDelayMax: selectedAgent.responseDelayMax,
        rateLimitMinutes: selectedAgent.rateLimitMinutes,
        businessHoursStart: selectedAgent.businessHoursStart,
        businessHoursEnd: selectedAgent.businessHoursEnd,
        timezone: selectedAgent.timezone,
        allowOutsideHours: selectedAgent.allowOutsideHours,
        firstMessageImmediate: selectedAgent.firstMessageImmediate,
        similarityThreshold: selectedAgent.similarityThreshold,
        confidenceThreshold: selectedAgent.confidenceThreshold,
        escalateToHumanRules: escalateRules,
        skipAutoReplyRules: skipRules,
        defaultLanguage: selectedAgent.defaultLanguage,
        autoDetectLanguage: selectedAgent.autoDetectLanguage,
      })
    } else {
      // Reset form
      setFormData({
        name: '',
        description: '',
        isActive: true,
        isDefault: false,
        tone: 'friendly',
        maxMessageLength: 300,
        maxTotalLength: 600,
        maxQuestionsPerMessage: 2,
        responseDelayMin: 0,
        responseDelayMax: 5,
        rateLimitMinutes: 2,
        businessHoursStart: '07:00',
        businessHoursEnd: '21:30',
        timezone: 'Asia/Dubai',
        allowOutsideHours: false,
        firstMessageImmediate: true,
        similarityThreshold: 0.7,
        confidenceThreshold: 50,
        defaultLanguage: 'en',
        autoDetectLanguage: true,
        trainingDocumentIds: [] as number[],
        allowedPhrases: '',
        prohibitedPhrases: '',
        escalateToHumanRules: '',
        skipAutoReplyRules: '',
        systemPrompt: '',
        customGreeting: '',
        customSignoff: '',
      })
    }
  }, [selectedAgent])

  async function loadAgents() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/ai-training/agents')
      const data = await res.json()
      if (data.ok) {
        setAgents(data.agents || [])
      } else {
        showToast(data.error || 'Failed to load agents', 'error')
      }
    } catch (error: any) {
      showToast('Failed to load agents', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function saveAgent() {
    if (!formData.name?.trim()) {
      showToast('Agent name is required', 'error')
      return
    }

    try {
      setSaving(true)
      const url = selectedAgent
        ? `/api/admin/ai-training/agents/${selectedAgent.id}`
        : '/api/admin/ai-training/agents'
      const method = selectedAgent ? 'PUT' : 'POST'

      // Convert form data to API format
      const payload: any = {
        ...formData,
        trainingDocumentIds: Array.isArray(formData.trainingDocumentIds)
          ? formData.trainingDocumentIds
          : [],
        // Convert newline-separated strings to arrays for JSON storage
        allowedPhrases: formData.allowedPhrases
          ? formData.allowedPhrases.split('\n').filter((p: string) => p.trim())
          : [],
        prohibitedPhrases: formData.prohibitedPhrases
          ? formData.prohibitedPhrases.split('\n').filter((p: string) => p.trim())
          : [],
        escalateToHumanRules: formData.escalateToHumanRules
          ? formData.escalateToHumanRules.split('\n').filter((p: string) => p.trim())
          : [],
        skipAutoReplyRules: formData.skipAutoReplyRules
          ? formData.skipAutoReplyRules.split('\n').filter((p: string) => p.trim())
          : [],
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.ok) {
        showToast(selectedAgent ? 'Agent updated' : 'Agent created', 'success')
        await loadAgents()
        if (data.agent) {
          setSelectedAgent(data.agent)
        }
        setIsCreating(false)
      } else {
        showToast(data.error || 'Failed to save agent', 'error')
      }
    } catch (error: any) {
      showToast('Failed to save agent', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteAgent(id: number) {
    if (!confirm('Are you sure you want to delete this agent? Leads using this agent will be unassigned.')) {
      return
    }

    try {
      const res = await fetch(`/api/admin/ai-training/agents/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()
      if (data.ok) {
        showToast('Agent deleted', 'success')
        if (selectedAgent?.id === id) {
          setSelectedAgent(null)
        }
        await loadAgents()
      } else {
        showToast(data.error || 'Failed to delete agent', 'error')
      }
    } catch (error: any) {
      showToast('Failed to delete agent', 'error')
    }
  }

  function handleNewAgent() {
    setSelectedAgent(null)
    setIsCreating(true)
    setFormData({
      name: '',
      description: '',
      isActive: true,
      isDefault: false,
      tone: 'friendly',
      maxMessageLength: 300,
      maxTotalLength: 600,
      maxQuestionsPerMessage: 2,
      responseDelayMin: 0,
      responseDelayMax: 5,
      rateLimitMinutes: 2,
      businessHoursStart: '07:00',
      businessHoursEnd: '21:30',
      timezone: 'Asia/Dubai',
      allowOutsideHours: false,
      firstMessageImmediate: true,
      similarityThreshold: 0.7,
      confidenceThreshold: 50,
      defaultLanguage: 'en',
      autoDetectLanguage: true,
      trainingDocumentIds: [] as number[],
      allowedPhrases: '',
      prohibitedPhrases: '',
      escalateToHumanRules: '',
      skipAutoReplyRules: '',
      systemPrompt: '',
      customGreeting: '',
      customSignoff: '',
    })
  }

  function handleCancel() {
    setSelectedAgent(null)
    setIsCreating(false)
  }

  const selectedTrainingDocs = Array.isArray(formData.trainingDocumentIds)
    ? formData.trainingDocumentIds
    : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Agent List */}
      <BentoCard className="lg:col-span-1" title="AI Agents">
        <Button onClick={handleNewAgent} className="w-full mb-4" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>

        {loading ? (
          <div className="space-y-2">
            <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No agents configured</p>
            <p className="text-xs text-slate-500">Create your first AI agent</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => {
                  setSelectedAgent(agent)
                  setIsCreating(false)
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedAgent?.id === agent.id
                    ? 'bg-primary/10 border-primary'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">{agent.name}</h3>
                      {agent.isDefault && (
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      )}
                      {!agent.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {agent.tone}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteAgent(agent.id)
                    }}
                    className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </BentoCard>

      {/* Right: Agent Settings Editor */}
      <BentoCard 
        className="lg:col-span-2" 
        title={selectedAgent ? `Edit: ${selectedAgent.name}` : isCreating ? 'New Agent' : 'Select an Agent'}
      >
        {selectedAgent || isCreating ? (
          <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
            {/* Basic Information */}
            <Section title="Basic Information">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="agent-name">Agent Name *</Label>
                  <Input
                    id="agent-name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Sales Agent, Customer Support Agent"
                  />
                </div>
                <div>
                  <Label htmlFor="agent-description">Description</Label>
                  <Textarea
                    id="agent-description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this agent's purpose"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agent-language">Default Language</Label>
                    <select
                      id="agent-language"
                      value={formData.defaultLanguage || 'en'}
                      onChange={(e) => setFormData({ ...formData, defaultLanguage: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                    >
                      <option value="en">English</option>
                      <option value="ar">Arabic</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="agent-tone">Tone</Label>
                    <select
                      id="agent-tone"
                      value={formData.tone || 'friendly'}
                      onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                    >
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="short">Short</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="agent-active"
                      checked={formData.isActive ?? true}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label htmlFor="agent-active" className="cursor-pointer">Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="agent-default"
                      checked={formData.isDefault ?? false}
                      onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                    />
                    <Label htmlFor="agent-default" className="cursor-pointer">Set as Default</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="agent-auto-detect"
                      checked={formData.autoDetectLanguage ?? true}
                      onCheckedChange={(checked) => setFormData({ ...formData, autoDetectLanguage: checked })}
                    />
                    <Label htmlFor="agent-auto-detect" className="cursor-pointer">Auto-detect Language</Label>
                  </div>
                </div>
              </div>
            </Section>

            {/* Training Documents Selection */}
            <Section title="Training Documents">
              <p className="text-sm text-muted-foreground mb-3">
                Select which training documents this agent should use for guidance
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {trainingDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No training documents available. Create some in the Training Documents tab.
                  </p>
                ) : (
                  trainingDocuments.map((doc) => (
                    <label key={doc.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTrainingDocs.includes(doc.id)}
                        onChange={(e) => {
                          const newIds = e.target.checked
                            ? [...selectedTrainingDocs, doc.id]
                            : selectedTrainingDocs.filter((id) => id !== doc.id)
                          setFormData({ ...formData, trainingDocumentIds: newIds })
                        }}
                        className="rounded"
                      />
                      <span className="text-sm flex-1">
                        {doc.title} <Badge variant="outline" className="ml-2 text-xs">{doc.type}</Badge>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </Section>

            {/* Response Behavior */}
            <Section title="Response Behavior">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="agent-system-prompt">Custom System Prompt</Label>
                  <Textarea
                    id="agent-system-prompt"
                    value={formData.systemPrompt || ''}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                    placeholder="Leave empty to use default system prompt. This overrides the base prompt."
                    rows={6}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="agent-max-first">Max First Message Length</Label>
                    <Input
                      id="agent-max-first"
                      type="number"
                      value={formData.maxMessageLength || 300}
                      onChange={(e) => setFormData({ ...formData, maxMessageLength: parseInt(e.target.value) || 300 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-max-total">Max Total Length</Label>
                    <Input
                      id="agent-max-total"
                      type="number"
                      value={formData.maxTotalLength || 600}
                      onChange={(e) => setFormData({ ...formData, maxTotalLength: parseInt(e.target.value) || 600 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-max-questions">Max Questions Per Message</Label>
                    <Input
                      id="agent-max-questions"
                      type="number"
                      value={formData.maxQuestionsPerMessage || 2}
                      onChange={(e) => setFormData({ ...formData, maxQuestionsPerMessage: parseInt(e.target.value) || 2 })}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Content Guidelines */}
            <Section title="Content Guidelines">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="agent-allowed">Allowed Phrases/Topics (one per line)</Label>
                  <Textarea
                    id="agent-allowed"
                    value={formData.allowedPhrases || ''}
                    onChange={(e) => setFormData({ ...formData, allowedPhrases: e.target.value })}
                    placeholder="These phrases/topics will be emphasized in responses"
                    rows={4}
                  />
                </div>
                <div>
                  <Label htmlFor="agent-prohibited">Prohibited Phrases/Topics (one per line)</Label>
                  <Textarea
                    id="agent-prohibited"
                    value={formData.prohibitedPhrases || ''}
                    onChange={(e) => setFormData({ ...formData, prohibitedPhrases: e.target.value })}
                    placeholder="AI will never use these phrases"
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agent-greeting">Custom Greeting</Label>
                    <Input
                      id="agent-greeting"
                      value={formData.customGreeting || ''}
                      onChange={(e) => setFormData({ ...formData, customGreeting: e.target.value })}
                      placeholder="e.g., Hi! Welcome to..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-signoff">Custom Signoff</Label>
                    <Input
                      id="agent-signoff"
                      value={formData.customSignoff || ''}
                      onChange={(e) => setFormData({ ...formData, customSignoff: e.target.value })}
                      placeholder="e.g., Best regards, [Agent Name]"
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Timing Controls */}
            <Section title="Timing Controls">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agent-delay-min">Response Delay Min (seconds)</Label>
                    <Input
                      id="agent-delay-min"
                      type="number"
                      value={formData.responseDelayMin || 0}
                      onChange={(e) => setFormData({ ...formData, responseDelayMin: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-delay-max">Response Delay Max (seconds)</Label>
                    <Input
                      id="agent-delay-max"
                      type="number"
                      value={formData.responseDelayMax || 5}
                      onChange={(e) => setFormData({ ...formData, responseDelayMax: parseInt(e.target.value) || 5 })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="agent-rate-limit">Rate Limit (minutes between replies)</Label>
                  <Input
                    id="agent-rate-limit"
                    type="number"
                    value={formData.rateLimitMinutes || 2}
                    onChange={(e) => setFormData({ ...formData, rateLimitMinutes: parseInt(e.target.value) || 2 })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agent-hours-start">Business Hours Start (Not Enforced)</Label>
                    <Input
                      id="agent-hours-start"
                      type="time"
                      value={formData.businessHoursStart || '07:00'}
                      onChange={(e) => setFormData({ ...formData, businessHoursStart: e.target.value })}
                      disabled={true}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Business hours are not currently enforced - replies are sent 24/7</p>
                  </div>
                  <div>
                    <Label htmlFor="agent-hours-end">Business Hours End (Not Enforced)</Label>
                    <Input
                      id="agent-hours-end"
                      type="time"
                      value={formData.businessHoursEnd || '21:30'}
                      onChange={(e) => setFormData({ ...formData, businessHoursEnd: e.target.value })}
                      disabled={true}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Business hours are not currently enforced - replies are sent 24/7</p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="agent-timezone">Timezone (Not Enforced)</Label>
                  <select
                    id="agent-timezone"
                    value={formData.timezone || 'Asia/Dubai'}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                    disabled={true}
                  >
                    <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Timezone setting is saved but not enforced - replies are sent 24/7</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="agent-outside-hours"
                      checked={true}
                      onCheckedChange={() => {}}
                      disabled={true}
                    />
                    <Label htmlFor="agent-outside-hours" className="cursor-pointer">
                      Allow Replies Outside Business Hours (Always Enabled - 24/7)
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">Business hours are not currently enforced - all replies are sent 24/7</p>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="agent-immediate"
                      checked={formData.firstMessageImmediate ?? true}
                      onCheckedChange={(checked) => setFormData({ ...formData, firstMessageImmediate: checked })}
                    />
                    <Label htmlFor="agent-immediate" className="cursor-pointer">Reply Immediately to First Message</Label>
                  </div>
                </div>
              </div>
            </Section>

            {/* Response Rules */}
            <Section title="Response Rules">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agent-similarity">Similarity Threshold (0-1)</Label>
                    <Input
                      id="agent-similarity"
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={formData.similarityThreshold || 0.7}
                      onChange={(e) => setFormData({ ...formData, similarityThreshold: parseFloat(e.target.value) || 0.7 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-confidence">Confidence Threshold (0-100)</Label>
                    <Input
                      id="agent-confidence"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.confidenceThreshold || 50}
                      onChange={(e) => setFormData({ ...formData, confidenceThreshold: parseInt(e.target.value) || 50 })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="agent-escalate">Escalate to Human Patterns (one per line)</Label>
                  <Textarea
                    id="agent-escalate"
                    value={formData.escalateToHumanRules || ''}
                    onChange={(e) => setFormData({ ...formData, escalateToHumanRules: e.target.value })}
                    placeholder="Messages matching these patterns will escalate to human"
                    rows={4}
                  />
                </div>
                <div>
                  <Label htmlFor="agent-skip">Skip Auto-Reply Patterns (one per line)</Label>
                  <Textarea
                    id="agent-skip"
                    value={formData.skipAutoReplyRules || ''}
                    onChange={(e) => setFormData({ ...formData, skipAutoReplyRules: e.target.value })}
                    placeholder="Messages matching these patterns will skip auto-reply"
                    rows={4}
                  />
                </div>
              </div>
            </Section>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4 border-t">
              <Button onClick={saveAgent} disabled={saving || !formData.name?.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? 'Saving...' : 'Save Agent'}
              </Button>
              {(selectedAgent || isCreating) && (
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Settings}
            title="Select an Agent"
            description="Choose an agent from the list to configure its response settings, or create a new agent."
          />
        )}
      </BentoCard>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}

