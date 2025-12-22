/**
 * Email Template Preview Page
 * For viewing and testing email marketing templates
 */

'use client'

import { EmailTemplate } from '@/components/marketing/EmailTemplate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { Copy, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function EmailPreviewPage() {
  const [recipientName, setRecipientName] = useState('Ahmed Hassan')
  const [subject, setSubject] = useState('Transform Your Business with Alain CRM')
  const [copied, setCopied] = useState(false)

  const copyHTML = () => {
    // In a real implementation, you'd generate the HTML from the component
    const html = `<!-- Email HTML would be generated here -->`
    navigator.clipboard.writeText(html)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-6">
          <Link href="/marketing">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Marketing
            </Button>
          </Link>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-xl font-bold mb-4">Email Settings</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="recipient">Recipient Name</Label>
                  <Input
                    id="recipient"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Recipient name"
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject"
                  />
                </div>
                <Button onClick={copyHTML} className="w-full" variant="outline">
                  <Copy className="h-4 w-4 mr-2" />
                  {copied ? 'Copied!' : 'Copy HTML'}
                </Button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="font-semibold mb-4">Email Tips</h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li>• Personalize with recipient name</li>
                <li>• Keep subject lines under 50 characters</li>
                <li>• Use clear, action-oriented CTAs</li>
                <li>• Test on multiple email clients</li>
                <li>• Include unsubscribe link</li>
              </ul>
            </div>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-4">
              <h2 className="text-xl font-bold mb-2">Email Preview</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Subject: <strong>{subject}</strong>
              </p>
            </div>
            <EmailTemplate
              recipientName={recipientName}
              subject={subject}
              preview={true}
            />
          </div>
        </div>
      </div>
    </div>
  )
}












