'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  User,
  MoreVertical,
  ArrowRight,
} from 'lucide-react'
import { format, addDays } from 'date-fns'

interface RenewalActionsProps {
  renewalId: number
  renewal: {
    id: number
    status: string
    lead: {
      id: number
      contact: {
        phone: string | null
        email: string | null
      }
    }
    assignedUser?: {
      id: number
      name: string
    } | null
  }
  users?: Array<{ id: number; name: string }>
  onActionComplete?: () => void
}

export function RenewalActions({
  renewalId,
  renewal,
  users = [],
  onActionComplete,
}: RenewalActionsProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  
  const [whatsappMessage, setWhatsappMessage] = useState('')
  const [selectedStatus, setSelectedStatus] = useState(renewal.status)
  const [selectedUserId, setSelectedUserId] = useState<string>(renewal.assignedUser?.id?.toString() || '')
  const [scheduleDays, setScheduleDays] = useState('7')

  const handleAction = async (action: string, data?: any) => {
    setLoading(action)
    try {
      const res = await fetch(`/api/renewals/${renewalId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Action failed')
      }

      showToast(result.message || 'Action completed successfully', 'success')
      
      // Close modals
      setShowWhatsAppModal(false)
      setShowStatusModal(false)
      setShowAssignModal(false)
      setShowScheduleModal(false)
      
      // Reset form values
      setWhatsappMessage('')
      setScheduleDays('7')

      if (onActionComplete) {
        onActionComplete()
      }
    } catch (error: any) {
      showToast(error.message || 'Action failed', 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleCall = () => {
    const phone = renewal.lead.contact.phone
    if (phone) {
      navigator.clipboard.writeText(phone)
      handleAction('call')
    }
  }

  const handleWhatsApp = () => {
    if (!whatsappMessage.trim()) {
      showToast('Please enter a message', 'error')
      return
    }
    handleAction('whatsapp', { message: whatsappMessage })
  }

  const handleEmail = () => {
    const email = renewal.lead.contact.email
    if (email) {
      window.location.href = `mailto:${email}`
      handleAction('email')
    } else {
      showToast('No email address available', 'error')
    }
  }

  const handleStatusChange = () => {
    handleAction('change-status', { status: selectedStatus })
  }

  const handleAssign = () => {
    handleAction('assign', { 
      assignedUserId: selectedUserId ? parseInt(selectedUserId) : null 
    })
  }

  const handleSchedule = () => {
    handleAction('schedule', { daysFromNow: parseInt(scheduleDays) })
  }

  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'CONTACTED', label: 'Contacted' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'RENEWED', label: 'Renewed' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'LOST', label: 'Lost' },
  ]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={handleCall}
            disabled={!renewal.lead.contact.phone || loading === 'call'}
          >
            <Phone className="h-4 w-4 mr-2" />
            Call
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowWhatsAppModal(true)}
            disabled={!renewal.lead.contact.phone || loading === 'whatsapp'}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleEmail}
            disabled={!renewal.lead.contact.email || loading === 'email'}
          >
            <Mail className="h-4 w-4 mr-2" />
            Email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowStatusModal(true)}
            disabled={loading === 'change-status'}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Change Status
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowAssignModal(true)}
            disabled={loading === 'assign'}
          >
            <User className="h-4 w-4 mr-2" />
            Assign Owner
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowScheduleModal(true)}
            disabled={loading === 'schedule'}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Schedule Follow-up
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* WhatsApp Modal */}
      <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send WhatsApp Message</DialogTitle>
            <DialogDescription>
              Send a WhatsApp message to {renewal.lead.contact.phone}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="whatsapp-message">Message</Label>
              <Input
                id="whatsapp-message"
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Enter your message..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    handleWhatsApp()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWhatsAppModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleWhatsApp} disabled={loading === 'whatsapp' || !whatsappMessage.trim()}>
              {loading === 'whatsapp' ? 'Sending...' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Modal */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
            <DialogDescription>
              Update the renewal status. This will automatically update last contacted date if transitioning to CONTACTED or IN_PROGRESS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatusChange} disabled={loading === 'change-status'}>
              {loading === 'change-status' ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Owner Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Owner</DialogTitle>
            <DialogDescription>
              Assign this renewal to a team member
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="assign-user">User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="assign-user">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={loading === 'assign'}>
              {loading === 'assign' ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Follow-up Modal */}
      <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
            <DialogDescription>
              Set a date for the next follow-up action
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="schedule-days">Days from now</Label>
              <Input
                id="schedule-days"
                type="number"
                value={scheduleDays}
                onChange={(e) => setScheduleDays(e.target.value)}
                min="1"
                placeholder="7"
              />
              {scheduleDays && (
                <p className="text-xs text-slate-500 mt-1">
                  Follow-up date: {format(addDays(new Date(), parseInt(scheduleDays) || 0), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={loading === 'schedule' || !scheduleDays}>
              {loading === 'schedule' ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

