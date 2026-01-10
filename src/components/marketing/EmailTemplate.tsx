/**
 * Email Marketing Template Component
 * For creating branded email campaigns
 */

'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, CheckCircle2, ArrowRight } from 'lucide-react'

interface EmailTemplateProps {
  recipientName?: string
  subject?: string
  ctaText?: string
  ctaLink?: string
  preview?: boolean
}

export function EmailTemplate({
  recipientName = 'Valued Client',
  subject = 'Transform Your Business with Alain CRM',
  ctaText = 'Get Started Free',
  ctaLink = 'https://crm.alainbcenter.com/setup',
  preview = false,
}: EmailTemplateProps) {
  return (
    <div className={preview ? 'max-w-2xl mx-auto p-4' : ''}>
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Email Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Alain Business Center CRM</h1>
          <p className="text-blue-100 text-sm mt-2">The Complete Solution for UAE Business Services</p>
        </div>

        {/* Email Body */}
        <div className="p-8">
          <h2 className="text-3xl font-bold mb-4">Hello {recipientName},</h2>
          
          <p className="text-lg text-gray-700 mb-6">
            Are you spending too much time managing leads manually? Missing follow-ups? 
            Losing track of renewals?
          </p>

          <p className="text-gray-600 mb-6">
            <strong>Alain CRM</strong> is the all-in-one solution built specifically for UAE business 
            services companies. Manage leads, automate workflows, and grow revenue—all in one place.
          </p>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-4 my-8">
            {[
              'AI-Powered Lead Qualification',
              'Multi-Channel Messaging',
              'Automated Follow-ups',
              'Renewal Revenue Engine',
              'Document Compliance',
              'Real-time Analytics',
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">{feature}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <div className="text-center my-8">
            <a href={ctaLink}>
              <Button size="lg" className="text-lg px-8 py-6">
                {ctaText}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
            <p className="text-sm text-gray-500 mt-4">
              No credit card required • Setup in 5 minutes
            </p>
          </div>

          {/* Social Proof */}
          <Card className="bg-gray-50 border-0 my-8">
            <CardContent className="p-6">
              <p className="text-sm text-gray-600 italic mb-2">
                "Alain CRM transformed how we manage leads. The AI automation alone saves us hours every day."
              </p>
              <p className="text-sm font-semibold">— Ahmed Al Maktoum, Business Development Manager</p>
            </CardContent>
          </Card>

          <p className="text-gray-600 mb-4">
            Ready to see how Alain CRM can help your business? 
            <a href={ctaLink} className="text-blue-600 hover:underline ml-1">
              Start your free trial today
            </a>.
          </p>

          <p className="text-gray-600">
            Best regards,<br />
            <strong>The Alain CRM Team</strong>
          </p>
        </div>

        {/* Email Footer */}
        <div className="bg-gray-100 p-6 text-center text-sm text-gray-600">
          <p className="mb-2">
            <strong>Alain Business Center</strong><br />
            Dubai, United Arab Emirates
          </p>
          <p className="mb-4">
            <a href="#" className="text-blue-600 hover:underline mr-4">
              Unsubscribe
            </a>
            <a href="#" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
          </p>
          <p className="text-xs">
            © 2025 Alain Business Center. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}












