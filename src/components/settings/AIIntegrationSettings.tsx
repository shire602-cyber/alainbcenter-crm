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
  AlertCircle,
  Sparkles,
  DollarSign,
  Zap
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

// AI Model options with pricing (per 1M tokens)
const AI_MODELS = [
  {
    provider: 'deepseek',
    name: 'deepseek-chat',
    label: 'DeepSeek Chat (Primary)',
    inputCost: 0.14,
    outputCost: 0.28,
    contextWindow: 64000,
    speed: 'fast',
    quality: 'very-high'
  },
  {
    provider: 'deepseek',
    name: 'deepseek-coder',
    label: 'DeepSeek Coder',
    inputCost: 0.14,
    outputCost: 0.28,
    contextWindow: 16000,
    speed: 'fast',
    quality: 'very-high'
  },
  {
    provider: 'openai',
    name: 'gpt-4o-mini',
    label: 'GPT-4o Mini (OpenAI - Fallback)',
    inputCost: 0.15,
    outputCost: 0.60,
    contextWindow: 128000,
    speed: 'fast',
    quality: 'high'
  },
  {
    provider: 'openai',
    name: 'gpt-4o',
    label: 'GPT-4o (OpenAI - Fallback)',
    inputCost: 2.50,
    outputCost: 10.00,
    contextWindow: 128000,
    speed: 'medium',
    quality: 'very-high'
  },
  {
    provider: 'groq',
    name: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B (Groq)',
    inputCost: 0.05,
    outputCost: 0.08,
    contextWindow: 8192,
    speed: 'very-fast',
    quality: 'medium'
  },
  {
    provider: 'groq',
    name: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B (Groq)',
    inputCost: 0.24,
    outputCost: 0.24,
    contextWindow: 32768,
    speed: 'fast',
    quality: 'high'
  },
  {
    provider: 'anthropic',
    name: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku (Anthropic)',
    inputCost: 0.80,
    outputCost: 4.00,
    contextWindow: 200000,
    speed: 'fast',
    quality: 'high'
  },
  {
    provider: 'anthropic',
    name: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet (Anthropic)',
    inputCost: 3.00,
    outputCost: 15.00,
    contextWindow: 200000,
    speed: 'medium',
    quality: 'very-high'
  },
]

export function AIIntegrationSettings({ initialIntegration }: { initialIntegration: Integration | null }) {
  const [integration, setIntegration] = useState<Integration | null>(initialIntegration)
  const [apiKey, setApiKey] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('deepseek')
  const [selectedModel, setSelectedModel] = useState('deepseek-chat')
  const [isEnabled, setIsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error' | null; message: string }>({ status: null, message: '' })

  useEffect(() => {
    if (integration) {
      setIsEnabled(integration.isEnabled || false)
      setApiKey(integration.apiKey || '')
      
      let config: any = {}
      try {
        config = integration.config ? JSON.parse(integration.config) : {}
      } catch {
        config = {}
      }
      
      setSelectedProvider(config.provider || 'deepseek')
      setSelectedModel(config.model || 'deepseek-chat')
    }
  }, [integration])

  const availableModels = AI_MODELS.filter(m => m.provider === selectedProvider)
  const selectedModelInfo = AI_MODELS.find(m => m.name === selectedModel && m.provider === selectedProvider)

  async function handleSave() {
    setSaving(true)
    try {
      // Use 'deepseek' integration name if provider is deepseek, otherwise 'openai'
      const integrationName = selectedProvider === 'deepseek' ? 'deepseek' : 'openai'
      
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: integrationName,
          provider: selectedProvider,
          apiKey: apiKey.trim() || null,
          config: JSON.stringify({
            provider: selectedProvider,
            model: selectedModel,
          }),
          enabled: isEnabled,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save integration')
      }

      const updated = await res.json()
      setIntegration(updated)
      setTestResult({ status: 'success', message: 'Settings saved successfully!' })
      setTimeout(() => setTestResult({ status: null, message: '' }), 3000)
    } catch (error: any) {
      setTestResult({ status: 'error', message: error.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult({ status: null, message: '' })
    
    try {
      const res = await fetch('/api/settings/integrations/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          apiKey: apiKey.trim(),
        }),
      })

      const data = await res.json()
      
      if (data.ok) {
        setTestResult({ 
          status: 'success', 
          message: `Test successful! Model: ${selectedModelInfo?.label || selectedModel}` 
        })
      } else {
        setTestResult({ 
          status: 'error', 
          message: data.error || 'Test failed' 
        })
      }
    } catch (error: any) {
      setTestResult({ 
        status: 'error', 
        message: error.message || 'Test failed' 
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Model Configuration
          </CardTitle>
          <CardDescription>
            Select an AI provider and model for draft generation. Cheaper models are recommended for high-volume automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div>
            <Label htmlFor="provider">AI Provider</Label>
            <Select
              id="provider"
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value)
                // Auto-select first model for new provider
                const firstModel = AI_MODELS.find(m => m.provider === e.target.value)
                if (firstModel) {
                  setSelectedModel(firstModel.name)
                }
              }}
            >
              <option value="deepseek">DeepSeek (Primary - Recommended)</option>
              <option value="openai">OpenAI (Fallback)</option>
              <option value="groq">Groq (Fastest & Cheapest)</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </Select>
          </div>

          {/* Model Selection */}
          <div>
            <Label htmlFor="model">AI Model</Label>
            <Select
              id="model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {availableModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.label}
                </option>
              ))}
            </Select>
            
            {selectedModelInfo && (
              <div className="mt-3 p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Input:</span>
                    <span>${selectedModelInfo.inputCost}/1M tokens</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Output:</span>
                    <span>${selectedModelInfo.outputCost}/1M tokens</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Speed:</span>
                    <Badge variant="outline">{selectedModelInfo.speed}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Quality:</span>
                    <Badge variant="outline">{selectedModelInfo.quality}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Context window: {selectedModelInfo.contextWindow.toLocaleString()} tokens
                </p>
              </div>
            )}
          </div>

          {/* API Key */}
          <div>
            <Label htmlFor="apiKey">
              API Key {selectedProvider === 'deepseek' ? '(DeepSeek)' : selectedProvider === 'openai' ? '(OpenAI)' : selectedProvider === 'groq' ? '(Groq)' : '(Anthropic)'}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                selectedProvider === 'deepseek'
                  ? 'sk-...'
                  : selectedProvider === 'openai' 
                  ? 'sk-...' 
                  : selectedProvider === 'groq'
                  ? 'gsk_...'
                  : 'sk-ant-...'
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              {selectedProvider === 'deepseek' && 'Get your API key from https://platform.deepseek.com/api_keys'}
              {selectedProvider === 'openai' && 'Get your API key from https://platform.openai.com/api-keys'}
              {selectedProvider === 'groq' && 'Get your API key from https://console.groq.com/keys'}
              {selectedProvider === 'anthropic' && 'Get your API key from https://console.anthropic.com/settings/keys'}
            </p>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="enabled" className="cursor-pointer">
              Enable AI for draft generation and automation
            </Label>
          </div>

          {/* Test Result */}
          {testResult.status && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              testResult.status === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {testResult.status === 'success' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleTest}
              disabled={testing || !apiKey.trim()}
              variant="outline"
            >
              <TestTube className="h-4 w-4 mr-2" />
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cost Estimation */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Estimation</CardTitle>
          <CardDescription>
            Estimated monthly costs based on usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedModelInfo && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Per 1,000 drafts:</strong> ~${((selectedModelInfo.inputCost * 2 + selectedModelInfo.outputCost * 0.5) / 1000).toFixed(4)}
              </p>
              <p>
                <strong>Per 10,000 drafts:</strong> ~${((selectedModelInfo.inputCost * 2 + selectedModelInfo.outputCost * 0.5) / 100).toFixed(2)}
              </p>
              <p className="text-muted-foreground text-xs mt-2">
                * Assumes ~2K input tokens and ~500 output tokens per draft
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}





