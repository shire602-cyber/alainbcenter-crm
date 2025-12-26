'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Save, 
  TestTube, 
  CheckCircle2, 
  XCircle,
  Sparkles,
  DollarSign,
  Zap,
  AlertCircle
} from 'lucide-react'

type Integration = {
  id: number
  name: string
  provider: string
  isEnabled: boolean
  apiKey: string | null
  config: string | null
  lastTestedAt: string | null
  lastTestStatus: string | null
  lastTestMessage: string | null
}

type ProviderConfig = {
  name: string
  label: string
  models: Array<{
    name: string
    label: string
    inputCost: number
    outputCost: number
    contextWindow: number
    speed: string
    quality: string
  }>
  apiKeyPlaceholder: string
  apiKeyHelpUrl: string
  apiKeyHelpText: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'deepseek',
    label: 'DeepSeek (Primary)',
    models: [
      {
        name: 'deepseek-chat',
        label: 'DeepSeek Chat',
        inputCost: 0.14,
        outputCost: 0.28,
        contextWindow: 64000,
        speed: 'fast',
        quality: 'very-high'
      },
      {
        name: 'deepseek-coder',
        label: 'DeepSeek Coder',
        inputCost: 0.14,
        outputCost: 0.28,
        contextWindow: 16000,
        speed: 'fast',
        quality: 'very-high'
      },
    ],
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyHelpText: 'Get your API key from https://platform.deepseek.com/api_keys'
  },
  {
    name: 'openai',
    label: 'OpenAI (Fallback)',
    models: [
      {
        name: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        inputCost: 0.15,
        outputCost: 0.60,
        contextWindow: 128000,
        speed: 'fast',
        quality: 'high'
      },
      {
        name: 'gpt-4o',
        label: 'GPT-4o',
        inputCost: 2.50,
        outputCost: 10.00,
        contextWindow: 128000,
        speed: 'medium',
        quality: 'very-high'
      },
    ],
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    apiKeyHelpText: 'Get your API key from https://platform.openai.com/api-keys'
  },
  {
    name: 'groq',
    label: 'Groq (Fast & Cheap)',
    models: [
      {
        name: 'llama-3.1-8b-instant',
        label: 'Llama 3.1 8B',
        inputCost: 0.05,
        outputCost: 0.08,
        contextWindow: 8192,
        speed: 'very-fast',
        quality: 'medium'
      },
      {
        name: 'mixtral-8x7b-32768',
        label: 'Mixtral 8x7B',
        inputCost: 0.24,
        outputCost: 0.24,
        contextWindow: 32768,
        speed: 'fast',
        quality: 'high'
      },
    ],
    apiKeyPlaceholder: 'gsk_...',
    apiKeyHelpUrl: 'https://console.groq.com/keys',
    apiKeyHelpText: 'Get your API key from https://console.groq.com/keys'
  },
  {
    name: 'anthropic',
    label: 'Anthropic (Claude)',
    models: [
      {
        name: 'claude-3-5-haiku-20241022',
        label: 'Claude 3.5 Haiku',
        inputCost: 0.80,
        outputCost: 4.00,
        contextWindow: 200000,
        speed: 'fast',
        quality: 'high'
      },
      {
        name: 'claude-3-5-sonnet-20241022',
        label: 'Claude 3.5 Sonnet',
        inputCost: 3.00,
        outputCost: 15.00,
        contextWindow: 200000,
        speed: 'medium',
        quality: 'very-high'
      },
    ],
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyHelpText: 'Get your API key from https://console.anthropic.com/settings/keys'
  },
]

export function MultiAIProviderSettings({ initialIntegrations }: { initialIntegrations: Record<string, Integration | null> }) {
  const [integrations, setIntegrations] = useState<Record<string, Integration | null>>(initialIntegrations || {})
  const [providerConfigs, setProviderConfigs] = useState<Record<string, {
    apiKey: string
    model: string
    isEnabled: boolean
  }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, { status: 'success' | 'error' | null; message: string }>>({})

  // Initialize provider configs from integrations
  useEffect(() => {
    const configs: Record<string, { apiKey: string; model: string; isEnabled: boolean }> = {}
    
    PROVIDERS.forEach(provider => {
      const integration = integrations[provider.name]
      let config: any = {}
      try {
        config = integration?.config ? JSON.parse(integration.config) : {}
      } catch {
        config = {}
      }
      
      configs[provider.name] = {
        apiKey: integration?.apiKey || '',
        model: config.model || provider.models[0].name,
        isEnabled: integration?.isEnabled || false,
      }
    })
    
    setProviderConfigs(configs)
  }, [integrations])

  async function handleSave(providerName: string) {
    setSaving(prev => ({ ...prev, [providerName]: true }))
    try {
      const config = providerConfigs[providerName]
      if (!config) return

      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: providerName,
          provider: providerName,
          apiKey: config.apiKey.trim() || null,
          config: JSON.stringify({
            provider: providerName,
            model: config.model,
          }),
          enabled: config.isEnabled,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save integration')
      }

      const updated = await res.json()
      setIntegrations(prev => ({ ...prev, [providerName]: updated }))
      setTestResults(prev => ({ ...prev, [providerName]: { status: 'success', message: 'Settings saved successfully!' } }))
      setTimeout(() => {
        setTestResults(prev => {
          const newResults = { ...prev }
          delete newResults[providerName]
          return newResults
        })
      }, 3000)
    } catch (error: any) {
      setTestResults(prev => ({ ...prev, [providerName]: { status: 'error', message: error.message || 'Failed to save' } }))
    } finally {
      setSaving(prev => ({ ...prev, [providerName]: false }))
    }
  }

  async function handleTest(providerName: string) {
    setTesting(prev => ({ ...prev, [providerName]: true }))
    setTestResults(prev => ({ ...prev, [providerName]: { status: null, message: '' } }))
    
    try {
      const config = providerConfigs[providerName]
      if (!config) return

      const provider = PROVIDERS.find(p => p.name === providerName)
      if (!provider) return

      const res = await fetch('/api/settings/integrations/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerName,
          model: config.model,
          apiKey: config.apiKey.trim(),
        }),
      })

      const data = await res.json()
      
      if (data.ok) {
        const modelInfo = provider.models.find(m => m.name === config.model)
        setTestResults(prev => ({ 
          ...prev, 
          [providerName]: { 
            status: 'success', 
            message: `Test successful! Model: ${modelInfo?.label || config.model}` 
          } 
        }))
      } else {
        setTestResults(prev => ({ 
          ...prev, 
          [providerName]: { 
            status: 'error', 
            message: data.error || 'Test failed' 
          } 
        }))
      }
    } catch (error: any) {
      setTestResults(prev => ({ 
        ...prev, 
        [providerName]: { 
          status: 'error', 
          message: error.message || 'Test failed' 
        } 
      }))
    } finally {
      setTesting(prev => ({ ...prev, [providerName]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Multiple Provider Configuration</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Configure multiple AI providers simultaneously. The system will use DeepSeek as primary, with automatic fallback to OpenAI, then Anthropic, then Groq if the primary fails.
            </p>
          </div>
        </div>
      </div>

      {PROVIDERS.map((provider) => {
        const config = providerConfigs[provider.name]
        const integration = integrations[provider.name]
        const isEnabled = config?.isEnabled || false
        const selectedModel = provider.models.find(m => m.name === config?.model) || provider.models[0]

        if (!config) return null

        return (
          <Card key={provider.name} className={isEnabled ? 'border-green-200 dark:border-green-800' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    {provider.label}
                  </CardTitle>
                  <CardDescription>
                    {provider.name === 'deepseek' && 'Primary provider - used for all AI requests'}
                    {provider.name === 'openai' && 'Fallback provider - used if DeepSeek fails'}
                    {provider.name === 'groq' && 'Fast and cost-effective option'}
                    {provider.name === 'anthropic' && 'Premium quality option'}
                  </CardDescription>
                </div>
                <Badge variant={isEnabled ? 'default' : 'secondary'}>
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Model Selection */}
              <div>
                <Label htmlFor={`model-${provider.name}`}>AI Model</Label>
                <Select
                  id={`model-${provider.name}`}
                  value={config.model}
                  onChange={(e) => {
                    setProviderConfigs(prev => ({
                      ...prev,
                      [provider.name]: { ...prev[provider.name]!, model: e.target.value }
                    }))
                  }}
                >
                  {provider.models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.label}
                    </option>
                  ))}
                </Select>
                
                {selectedModel && (
                  <div className="mt-3 p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Input:</span>
                        <span>${selectedModel.inputCost}/1M tokens</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Output:</span>
                        <span>${selectedModel.outputCost}/1M tokens</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Speed:</span>
                        <Badge variant="outline">{selectedModel.speed}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Quality:</span>
                        <Badge variant="outline">{selectedModel.quality}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Context window: {selectedModel.contextWindow.toLocaleString()} tokens
                    </p>
                  </div>
                )}
              </div>

              {/* API Key */}
              <div>
                <Label htmlFor={`apiKey-${provider.name}`}>API Key</Label>
                <Input
                  id={`apiKey-${provider.name}`}
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => {
                    setProviderConfigs(prev => ({
                      ...prev,
                      [provider.name]: { ...prev[provider.name]!, apiKey: e.target.value }
                    }))
                  }}
                  placeholder={provider.apiKeyPlaceholder}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {provider.apiKeyHelpText}
                </p>
              </div>

              {/* Enable Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enabled-${provider.name}`}
                  checked={config.isEnabled}
                  onChange={(e) => {
                    setProviderConfigs(prev => ({
                      ...prev,
                      [provider.name]: { ...prev[provider.name]!, isEnabled: e.target.checked }
                    }))
                  }}
                  className="h-4 w-4"
                />
                <Label htmlFor={`enabled-${provider.name}`} className="cursor-pointer">
                  Enable {provider.label} for AI requests
                </Label>
              </div>

              {/* Test Result */}
              {testResults[provider.name]?.status && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResults[provider.name].status === 'success' 
                    ? 'bg-green-50 text-green-800 border border-green-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {testResults[provider.name].status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  <span className="text-sm">{testResults[provider.name].message}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleTest(provider.name)}
                  disabled={testing[provider.name] || !config.apiKey.trim()}
                  variant="outline"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {testing[provider.name] ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button
                  onClick={() => handleSave(provider.name)}
                  disabled={saving[provider.name]}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving[provider.name] ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

