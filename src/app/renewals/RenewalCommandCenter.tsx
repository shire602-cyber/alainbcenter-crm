'use client'

import { useState, useEffect, useMemo } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import {
  AlertTriangle,
  RefreshCw,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  User,
  ChevronRight,
  Search,
  Play,
  Loader2,
} from 'lucide-react'
import { format, differenceInDays, parseISO, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface RenewalItem {
  id: number
  leadId: number
  serviceType: string
  serviceName: string | null
  expiresAt: string
  status: string
  expectedValue: number | null
  assignedToUserId: number | null
  lastContactedAt: string | null
  nextActionAt: string | null
  lead: {
    id: number
    contact: {
      id: number
      fullName: string
      phone: string | null
      email: string | null
    }
    assignedUser: {
      id: number
      name: string
    } | null
  }
  assignedTo: {
    id: number
    name: string
  } | null
  daysRemaining?: number
}

type QueueType = 'urgent' | 'this-week' | 'later' | 'expired'

export default function RenewalCommandCenter() {
  const router = useRouter()
  const { showToast } = useToast()
  
  const [renewalItems, setRenewalItems] = useState<RenewalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<RenewalItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeQueue, setActiveQueue] = useState<QueueType>('urgent')
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [selectedActionItem, setSelectedActionItem] = useState<RenewalItem | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [templates, setTemplates] = useState<Array<{ name: string; language: string; category: string; components?: any[] }>>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<{ name: string; language: string; category: string; components?: any[] } | null>(null)
  const [templateVariables, setTemplateVariables] = useState<string[]>([])
  const [sendingTemplate, setSendingTemplate] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data.user?.role?.toUpperCase() === 'ADMIN')
      })
      .catch(() => {})
    
    loadRenewals()
  }, [])

  async function loadRenewals() {
    try {
      setLoading(true)
      const res = await fetch('/api/renewals-v2')
      if (res.ok) {
        const data = await res.json()
        setRenewalItems(data.items || [])
      }
    } catch (err) {
      console.error('Failed to load renewals:', err)
      showToast('Failed to load renewals', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Categorize renewals into queues
  const queues = useMemo(() => {
    const now = new Date()
    const urgent: RenewalItem[] = []
    const thisWeek: RenewalItem[] = []
    const later: RenewalItem[] = []
    const expired: RenewalItem[] = []

    renewalItems.forEach(item => {
      const days = differenceInDays(parseISO(item.expiresAt), now)
      const daysRemaining = days

      if (daysRemaining < 0) {
        expired.push(item)
      } else if (daysRemaining <= 1) {
        urgent.push(item)
      } else if (daysRemaining <= 7) {
        thisWeek.push(item)
      } else {
        later.push(item)
      }
    })

    // Sort each queue by urgency
    const sortByUrgency = (a: RenewalItem, b: RenewalItem) => {
      const daysA = differenceInDays(parseISO(a.expiresAt), now)
      const daysB = differenceInDays(parseISO(b.expiresAt), now)
      return daysA - daysB
    }

    return {
      urgent: urgent.sort(sortByUrgency),
      'this-week': thisWeek.sort(sortByUrgency),
      later: later.sort(sortByUrgency),
      expired: expired.sort(sortByUrgency),
    }
  }, [renewalItems])

  // Filter by search query
  const filteredQueues = useMemo(() => {
    if (!searchQuery.trim()) return queues

    const query = searchQuery.toLowerCase()
    const filterItems = (items: RenewalItem[]) =>
      items.filter(item =>
        item.lead?.contact?.fullName?.toLowerCase().includes(query) ||
        item.lead?.contact?.phone?.includes(query) ||
        item.serviceType?.toLowerCase().includes(query)
      )

    return {
      urgent: filterItems(queues.urgent),
      'this-week': filterItems(queues['this-week']),
      later: filterItems(queues.later),
      expired: filterItems(queues.expired),
    }
  }, [queues, searchQuery])

  const activeItems = filteredQueues[activeQueue]

  async function handleRunEngine(dryRun: boolean) {
    if (!isAdmin) return
    
    try {
      const endpoint = dryRun ? '/api/renewals/engine/dry-run' : '/api/renewals/engine/run'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowDays: 30,
          onlyNotContacted: true,
        }),
      })
      
      const data = await res.json()
      
      if (dryRun) {
        showToast(
          `Dry run: ${data.totals?.sendCount || 0} would send, ${data.totals?.skipCount || 0} skipped`,
          'info'
        )
      } else {
        showToast(
          `Engine ran: ${data.summary?.sent || 0} sent, ${data.summary?.failed || 0} failed`,
          'success'
        )
        await loadRenewals()
      }
    } catch (err) {
      showToast('Engine run failed', 'error')
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true)
    setTemplateError(null)
    try {
      const res = await fetch('/api/whatsapp/templates?onlyApproved=1')
      const data = await res.json()
      
      if (data.ok && data.templates) {
        setTemplates(data.templates)
        if (data.templates.length === 0) {
          setTemplateError('No approved templates returned from this WABA.')
        }
      } else {
        const errorMsg = data.message || data.error || 'Failed to load templates'
        const errorDetails = data.details?.error?.message || data.details?.error?.error_user_msg || ''
        const fullError = errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg
        
        setTemplateError(fullError)
        console.error('Failed to load templates:', {
          status: res.status,
          error: data.error,
          message: data.message,
          details: data.details,
        })
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to load templates'
      setTemplateError(errorMsg)
      console.error('Failed to load templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }

  async function markRenewalContacted(item: RenewalItem) {
    await fetch(`/api/renewals-v2/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastContactedAt: new Date().toISOString(),
        status: item.status === 'UPCOMING' || item.status === 'EXPIRED' ? 'CONTACTED' : item.status,
      }),
    })
  }

  async function handleSendTemplate() {
    if (!selectedActionItem || !selectedTemplate) return

    setSendingTemplate(true)
    try {
      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedActionItem.lead?.contact?.phone,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          variables: templateVariables,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        await markRenewalContacted(selectedActionItem)
        showToast('WhatsApp template sent', 'success')
        await loadRenewals()
        setShowWhatsAppModal(false)
        setSelectedTemplate(null)
        setTemplateVariables([])
        setSelectedActionItem(null)
      } else {
        showToast(data.error || 'Failed to send template', 'error')
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to send template', 'error')
    } finally {
      setSendingTemplate(false)
    }
  }

  async function handleAction(action: 'call' | 'whatsapp' | 'email', item: RenewalItem, data?: any) {
    setIsActionLoading(true)
    try {
      switch (action) {
        case 'call':
          if (item.lead?.contact?.phone) {
            navigator.clipboard.writeText(item.lead.contact.phone)
            showToast('Phone number copied to clipboard', 'success')
            
            // Log contact
            await fetch(`/api/renewals-v2/${item.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lastContactedAt: new Date().toISOString(),
                status: item.status === 'UPCOMING' || item.status === 'EXPIRED' ? 'CONTACTED' : item.status,
              }),
            })
            await loadRenewals()
          }
          break

        case 'whatsapp':
          setSelectedActionItem(item)
          await loadTemplates()
          setShowWhatsAppModal(true)
          break

        case 'email':
          if (item.lead?.contact?.email) {
            window.location.href = `mailto:${item.lead.contact.email}`
            await markRenewalContacted(item)
            await loadRenewals()
          }
          break
      }
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error')
    } finally {
      setIsActionLoading(false)
    }
  }

  function handleRowClick(item: RenewalItem) {
    setSelectedItem(item)
    setDrawerOpen(true)
  }

  const getServiceTypeBadge = (serviceType: string) => {
    const colors: Record<string, string> = {
      'TRADE_LICENSE': 'bg-blue-100 text-blue-800 font-semibold',
      'EMIRATES_ID': 'bg-green-100 text-green-800 font-semibold',
      'RESIDENCY': 'bg-purple-100 text-purple-800 font-semibold',
      'VISIT_VISA': 'bg-orange-100 text-orange-800 font-semibold',
    }
    return (
      <Badge className={cn('text-xs font-medium', colors[serviceType] || 'bg-gray-100 text-gray-800')}>
        {serviceType.replace(/_/g, ' ')}
      </Badge>
    )
  }

  const getExpiryCountdown = (expiresAt: string) => {
    const now = new Date()
    const days = differenceInDays(parseISO(expiresAt), now)
    
    if (days < 0) {
      return <span className="text-red-700 font-bold tracking-tight">Expired {Math.abs(days)}d ago</span>
    } else if (days === 0) {
      return <span className="text-red-700 font-bold tracking-tight">Expires today</span>
    } else if (days === 1) {
      return <span className="text-orange-700 font-bold tracking-tight">1 day left</span>
    } else if (days <= 7) {
      return <span className="text-orange-700 font-bold tracking-tight">{days} days left</span>
    } else {
      return <span className="text-slate-600 font-medium">{days} days left</span>
    }
  }

  const getLastContacted = (lastContactedAt: string | null) => {
    if (!lastContactedAt) {
      return <span className="text-slate-400 text-xs">Never</span>
    }
    try {
      return (
        <span className="text-xs text-slate-600">
          {formatDistanceToNow(parseISO(lastContactedAt), { addSuffix: true })}
        </span>
      )
    } catch {
      return <span className="text-xs text-slate-600">{format(parseISO(lastContactedAt), 'MMM d')}</span>
    }
  }

  const queueTabs = [
    { id: 'urgent' as QueueType, label: 'Urgent Today', count: filteredQueues.urgent.length },
    { id: 'this-week' as QueueType, label: 'This Week', count: filteredQueues['this-week'].length },
    { id: 'later' as QueueType, label: 'Later', count: filteredQueues.later.length },
    { id: 'expired' as QueueType, label: 'Expired', count: filteredQueues.expired.length },
  ]

  return (
    <MainLayout>
      <div className="h-screen flex flex-col bg-background">
        {/* Command Bar */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
          <div className="px-6 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-slate-900">
                Renewals
              </h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64 pl-9 h-9 text-sm"
                  />
                </div>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunEngine(true)}
                    className="gap-2 h-9"
                  >
                    <Play className="h-4 w-4" />
                    Dry Run
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadRenewals}
                  className="gap-2 h-9"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Queue Tabs */}
        <div className="border-b border-slate-200 bg-white">
          <div className="px-6">
            <Tabs value={activeQueue} onValueChange={(v) => setActiveQueue(v as QueueType)}>
              <TabsList className="h-10">
                {queueTabs.map(tab => (
                  <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                    {tab.label}
                    {tab.count > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {tab.count}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Renewal List */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-6">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : activeItems.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-slate-500">
                  {searchQuery ? 'No renewals match your search' : `No renewals in ${queueTabs.find(t => t.id === activeQueue)?.label.toLowerCase()}`}
                </p>
              </Card>
            ) : (
              <div className="space-y-1">
                {activeItems.map((item) => {
                  const days = differenceInDays(parseISO(item.expiresAt), new Date())
                  
                  return (
                    <Card
                      key={item.id}
                      className="p-3 hover:shadow-md transition-all cursor-pointer border hover:border-primary/30"
                      onClick={() => handleRowClick(item)}
                    >
                      <div className="flex items-center gap-4">
                        {/* Lead Identity */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-slate-900 truncate">
                              {item.lead?.contact?.fullName || 'Unknown'}
                            </span>
                            {getServiceTypeBadge(item.serviceType)}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-600">
                            <span>{item.lead?.contact?.phone || 'No phone'}</span>
                          </div>
                        </div>

                        {/* Expiry Countdown */}
                        <div className="w-32 text-right">
                          {getExpiryCountdown(item.expiresAt)}
                        </div>

                        {/* Estimated Value */}
                        <div className="w-24 text-right">
                          {item.expectedValue ? (
                            <span className="text-sm font-semibold text-green-600">
                              AED {item.expectedValue.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>

                        {/* Assigned Owner */}
                        <div className="w-32">
                          {item.assignedTo ? (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3 text-slate-400" />
                              <span className="text-xs text-slate-600 truncate">
                                {item.assignedTo.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Unassigned</span>
                          )}
                        </div>

                        {/* Last Contacted */}
                        <div className="w-32">
                          {getLastContacted(item.lastContactedAt)}
                        </div>

                        {/* Inline Actions */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction('call', item)}
                            disabled={!item.lead?.contact?.phone || isActionLoading}
                            className="h-8 w-8 p-0"
                            title="Call"
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedActionItem(item)
                              loadTemplates()
                              setShowWhatsAppModal(true)
                            }}
                            disabled={!item.lead?.contact?.phone || isActionLoading}
                            className="h-8 w-8 p-0"
                            title="WhatsApp"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction('email', item)}
                            disabled={!item.lead?.contact?.email || isActionLoading}
                            className="h-8 w-8 p-0"
                            title="Email"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:w-[540px] overflow-y-auto">
          {selectedItem ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedItem.lead?.contact?.fullName || 'Renewal Details'}</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <Card className="p-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Renewal Type:</span>
                      {getServiceTypeBadge(selectedItem.serviceType)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Expires At:</span>
                      <span className="font-medium">{format(parseISO(selectedItem.expiresAt), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Estimated Value:</span>
                      <span className="font-medium">
                        {selectedItem.expectedValue ? `AED ${selectedItem.expectedValue.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Status:</span>
                      <Badge variant="secondary">{selectedItem.status}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Assigned To:</span>
                      <span className="font-medium">
                        {selectedItem.assignedTo?.name || 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Last Contacted:</span>
                      <span className="font-medium">
                        {getLastContacted(selectedItem.lastContactedAt)}
                      </span>
                    </div>
                  </div>
                </Card>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction('call', selectedItem)}
                    disabled={!selectedItem.lead?.contact?.phone}
                    className="flex-1"
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedActionItem(selectedItem)
                      loadTemplates()
                      setShowWhatsAppModal(true)
                    }}
                    disabled={!selectedItem.lead?.contact?.phone}
                    className="flex-1"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedItem.lead?.contact?.phone) {
                        router.push(`/inbox?phone=${encodeURIComponent(selectedItem.lead.contact.phone)}`)
                      }
                    }}
                    disabled={!selectedItem.lead?.contact?.phone}
                    className="flex-1"
                  >
                    Open Inbox
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* WhatsApp Modal */}
      {showWhatsAppModal && selectedActionItem && (
        <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send WhatsApp Template</DialogTitle>
              <DialogDescription>
                Send a Meta-approved template to {selectedActionItem.lead?.contact?.phone}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {templateError && (
                <div className="p-3 border border-red-300/60 bg-red-50 rounded-lg text-body text-red-700">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Error loading templates</p>
                      <p className="mt-1">{templateError}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadTemplates}
                    className="mt-2"
                    disabled={loadingTemplates}
                  >
                    {loadingTemplates ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Refreshing...
                      </>
                    ) : (
                      'Refresh'
                    )}
                  </Button>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="renewal-template-select">Template</Label>
                  {!loadingTemplates && !templateError && (
                    <button
                      type="button"
                      onClick={loadTemplates}
                      className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Refresh
                    </button>
                  )}
                </div>
                {loadingTemplates ? (
                  <div className="mt-2 p-4 border rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading templates...
                  </div>
                ) : templateError && templates.length === 0 ? (
                  <div className="mt-2 p-4 border rounded-lg text-sm text-muted-foreground">
                    Unable to load templates. Check the error message above.
                  </div>
                ) : templates.length === 0 ? (
                  <div className="mt-2 p-4 border rounded-lg text-sm text-muted-foreground">
                    No approved templates returned from this WABA.
                  </div>
                ) : (
                  <Select
                    id="renewal-template-select"
                    value={selectedTemplate ? `${selectedTemplate.name}|${selectedTemplate.language}` : ''}
                    onChange={(e) => {
                      const [name, language] = e.target.value.split('|')
                      const template = templates.find(t => t.name === name && t.language === language)
                      if (template) {
                        setSelectedTemplate(template)
                        const bodyComponent = template.components?.find((c: any) => c.type === 'body')
                        let variableCount = 0
                        if (bodyComponent) {
                          const text = bodyComponent.text || ''
                          const matches = text.match(/\{\{(\d+)\}\}/g) || []
                          const variableNumbers = matches.map((m: string) => parseInt(m.replace(/[{}]/g, '')))
                          variableCount = variableNumbers.length > 0 ? Math.max(...variableNumbers) : 0
                        }
                        setTemplateVariables(new Array(variableCount).fill(''))
                      }
                    }}
                    className="mt-2"
                  >
                    <option value="">Select a template...</option>
                    {templates.map((template, idx) => (
                      <option key={idx} value={`${template.name}|${template.language}`}>
                        {template.name} ({template.language}) - {template.category}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {selectedTemplate && templateVariables.length > 0 && (
                <div className="space-y-2">
                  <Label>Template Variables</Label>
                  {templateVariables.map((value, idx) => (
                    <div key={idx}>
                      <Label htmlFor={`renewal-var-${idx}`} className="text-xs text-muted-foreground">
                        Variable {idx + 1}
                      </Label>
                      <Input
                        id={`renewal-var-${idx}`}
                        value={value}
                        onChange={(e) => {
                          const newVars = [...templateVariables]
                          newVars[idx] = e.target.value
                          setTemplateVariables(newVars)
                        }}
                        placeholder={`Enter value for variable ${idx + 1}`}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWhatsAppModal(false)
                  setSelectedTemplate(null)
                  setTemplateVariables([])
                  setSelectedActionItem(null)
                }}
                disabled={sendingTemplate}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendTemplate}
                disabled={!selectedTemplate || sendingTemplate}
              >
                {sendingTemplate ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  'Send Template'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  )
}
