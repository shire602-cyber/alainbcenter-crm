/**
 * Pricing Page
 * Showcase pricing tiers and plans
 */

'use client'

import { PricingCard } from '@/components/marketing/PricingCard'
import { StatsSection } from '@/components/marketing/StatsSection'
import { Users, Zap, Shield, Globe } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function PricingPage() {
  const stats = [
    {
      icon: Users,
      value: '500+',
      label: 'Active Users',
      description: 'Growing daily',
    },
    {
      icon: Zap,
      value: '10K+',
      label: 'Leads Managed',
      description: 'Per month',
    },
    {
      icon: Shield,
      value: '99.9%',
      label: 'Uptime',
      description: 'Reliable & secure',
    },
    {
      icon: Globe,
      value: 'UAE',
      label: 'Optimized',
      description: 'Built for local business',
    },
  ]

  const plans = [
    {
      name: 'Starter',
      price: 'Free',
      period: '',
      description: 'Perfect for small teams getting started',
      features: [
        { text: 'Up to 100 leads', included: true },
        { text: 'Basic messaging', included: true },
        { text: 'AI lead scoring', included: true },
        { text: 'WhatsApp integration', included: true },
        { text: 'Email support', included: true },
        { text: 'Advanced automation', included: false },
        { text: 'Renewal revenue engine', included: false },
        { text: 'Priority support', included: false },
      ],
      ctaText: 'Get Started',
      ctaLink: '/setup',
      popular: false,
    },
    {
      name: 'Professional',
      price: 'AED 299',
      period: '/month',
      description: 'For growing businesses',
      features: [
        { text: 'Unlimited leads', included: true },
        { text: 'Multi-channel messaging', included: true },
        { text: 'AI automation & drafts', included: true },
        { text: 'Renewal revenue engine', included: true },
        { text: 'Document compliance', included: true },
        { text: 'Advanced analytics', included: true },
        { text: 'Team collaboration', included: true },
        { text: 'Priority support', included: true },
      ],
      ctaText: 'Start Free Trial',
      ctaLink: '/setup',
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For large teams with custom needs',
      features: [
        { text: 'Everything in Professional', included: true },
        { text: 'Custom integrations', included: true },
        { text: 'Dedicated account manager', included: true },
        { text: 'SLA guarantee', included: true },
        { text: 'Custom training', included: true },
        { text: 'API access', included: true },
        { text: 'White-label options', included: true },
        { text: '24/7 phone support', included: true },
      ],
      ctaText: 'Contact Sales',
      ctaLink: '/login',
      popular: false,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 py-4">
          <Link href="/marketing">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <section className="py-16 border-b">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold mb-6">Simple, Transparent Pricing</h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
              Choose the plan that fits your business. All plans include core features.
              Upgrade or downgrade anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <StatsSection stats={stats} />

      {/* Pricing Cards */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, idx) => (
              <PricingCard key={idx} {...plan} />
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              All plans include 14-day free trial. No credit card required.
            </p>
            <Link href="/setup">
              <Button size="lg" variant="outline">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50 border-t">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            <div className="space-y-6">
              {[
                {
                  q: 'Can I change plans later?',
                  a: 'Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.',
                },
                {
                  q: 'What payment methods do you accept?',
                  a: 'We accept all major credit cards, bank transfers, and UAE local payment methods.',
                },
                {
                  q: 'Is there a setup fee?',
                  a: 'No setup fees. Just choose your plan and start using Alain CRM immediately.',
                },
                {
                  q: 'Do you offer discounts for annual plans?',
                  a: 'Yes! Annual plans save you 20%. Contact us for custom enterprise pricing.',
                },
              ].map((faq, idx) => (
                <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-6 border">
                  <h3 className="font-semibold text-lg mb-2">{faq.q}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}












