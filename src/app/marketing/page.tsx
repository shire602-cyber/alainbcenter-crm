/**
 * Marketing Landing Page
 * Public-facing page showcasing Alain CRM features
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Zap,
  Shield,
  TrendingUp,
  Users,
  Clock,
  CheckCircle2,
  Sparkles,
  BarChart3,
  FileText,
  Globe,
  Smartphone,
  Mail,
  Calendar,
  Target,
  DollarSign,
  ArrowRight,
  Star,
  Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MarketingPage() {
  const [activeFeature, setActiveFeature] = useState(0)

  const features = [
    {
      icon: MessageSquare,
      title: 'Multi-Channel Messaging',
      description: 'Unified inbox for WhatsApp, Email, Instagram, Facebook. Never miss a conversation.',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
    },
    {
      icon: Sparkles,
      title: 'AI-Powered Automation',
      description: 'Smart lead qualification, auto-replies, and intelligent follow-ups. Work smarter, not harder.',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
    },
    {
      icon: TrendingUp,
      title: 'Renewal Revenue Engine',
      description: 'Track expiries, forecast revenue, and never miss a renewal opportunity.',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
    },
    {
      icon: FileText,
      title: 'Compliance Intelligence',
      description: 'Smart document tracking, expiry alerts, and compliance status for every lead.',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
    },
    {
      icon: Zap,
      title: 'Autopilot Automation',
      description: 'Set it and forget it. Automated workflows handle follow-ups, reminders, and more.',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-50',
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Real-time KPIs, user performance, and revenue insights at your fingertips.',
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50',
    },
  ]

  const benefits = [
    {
      icon: Clock,
      title: 'Save 10+ Hours Per Week',
      description: 'Automation handles routine tasks, letting you focus on closing deals.',
    },
    {
      icon: Target,
      title: 'Increase Conversion by 40%',
      description: 'AI-powered lead scoring and timely follow-ups boost your win rate.',
    },
    {
      icon: DollarSign,
      title: 'Capture More Renewals',
      description: 'Never miss an expiry. Automated renewal reminders recover lost revenue.',
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Shared inbox, task assignment, and real-time updates keep everyone aligned.',
    },
  ]

  const testimonials = [
    {
      name: 'Ahmed Al Maktoum',
      role: 'Business Development Manager',
      company: 'Alain Business Center',
      content: 'Alain CRM transformed how we manage leads. The AI automation alone saves us hours every day.',
      rating: 5,
    },
    {
      name: 'Sarah Hassan',
      role: 'Operations Director',
      company: 'Alain Business Center',
      content: 'The renewal revenue engine is a game-changer. We\'ve recovered 30% more renewals since using it.',
      rating: 5,
    },
    {
      name: 'Mohammed Ali',
      role: 'Sales Team Lead',
      company: 'Alain Business Center',
      content: 'Multi-channel inbox means we never miss a WhatsApp or email. Our response time improved dramatically.',
      rating: 5,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b">
        <div className="container mx-auto px-4 py-24 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-6 text-sm px-4 py-1.5 bg-blue-100 text-blue-700 font-semibold">
              Built for UAE Business Services
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent tracking-tight">
              The CRM That Grows
              <br />
              <span className="text-blue-700">Your Business</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto font-medium">
              All-in-one CRM for visa services, business setup, and renewals. 
              AI-powered automation, multi-channel messaging, and compliance intelligence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/login">
                <Button size="lg" className="text-lg px-8 py-6 font-semibold">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#features">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 font-semibold">
                  See Features
                </Button>
              </Link>
            </div>
            <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-600 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>No Credit Card</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Setup in 5 Minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>UAE-Optimized</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 border-b">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Manage Leads</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed specifically for UAE business services and visa companies
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {features.map((feature, idx) => {
              const Icon = feature.icon
              return (
                <Card
                  key={idx}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-lg hover:scale-105',
                    activeFeature === idx && 'ring-2 ring-blue-500'
                  )}
                  onMouseEnter={() => setActiveFeature(idx)}
                >
                  <CardHeader>
                    <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center mb-4', feature.bgColor)}>
                      <Icon className={cn('h-6 w-6', feature.color)} />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Feature Highlight */}
          <div className="mt-16 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <Badge className="mb-4">Most Popular</Badge>
                <h3 className="text-3xl font-bold mb-4">AI-Powered Lead Qualification</h3>
                <p className="text-lg text-gray-600 mb-6">
                  Automatically score and qualify every lead. Our AI analyzes contact info, 
                  service requests, and engagement to give you a 0-100 score. 
                  Focus on hot leads, never miss a warm opportunity.
                </p>
                <ul className="space-y-3">
                  {['Instant lead scoring', 'Smart qualification notes', 'Automatic categorization', 'Priority recommendations'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-xl">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-semibold">Ahmed Hassan</p>
                      <p className="text-sm text-gray-600">Family Visa Inquiry</p>
                    </div>
                    <Badge className="bg-red-100 text-red-700">
                      HOT 85
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                    <div>
                      <p className="font-semibold">Sarah Ali</p>
                      <p className="text-sm text-gray-600">Business Setup</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      WARM 62
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div>
                      <p className="font-semibold">Mohammed Khan</p>
                      <p className="text-sm text-gray-600">General Inquiry</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700">
                      COLD 35
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 border-b bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why Teams Choose Alain CRM</h2>
            <p className="text-xl text-gray-600">
              Real results from real businesses
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, idx) => {
              const Icon = benefit.icon
              return (
                <Card key={idx} className="text-center">
                  <CardHeader>
                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-8 w-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-xl">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">{benefit.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-b">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Loved by Teams Across UAE</h2>
            <p className="text-xl text-gray-600">
              See what our users are saying
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <Card key={idx} className="relative">
                <CardHeader>
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <CardDescription className="text-base italic">
                    "{testimonial.content}"
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{testimonial.name}</p>
                      <p className="text-sm text-gray-600">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center text-white">
            <Building2 className="h-16 w-16 mx-auto mb-6 opacity-90" />
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Transform Your Business?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join leading UAE businesses using Alain CRM to manage leads, 
              automate workflows, and grow revenue.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/setup">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 bg-white/10 border-white/20 text-white hover:bg-white/20">
                  Schedule Demo
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm opacity-75">
              No credit card required • Setup in 5 minutes • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-bold text-lg mb-4">Alain CRM</h3>
              <p className="text-gray-600 text-sm">
                The complete CRM solution for UAE business services companies.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="#features" className="hover:text-blue-600">Features</Link></li>
                <li><Link href="/login" className="hover:text-blue-600">Pricing</Link></li>
                <li><Link href="/login" className="hover:text-blue-600">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="/login" className="hover:text-blue-600">About</Link></li>
                <li><Link href="/login" className="hover:text-blue-600">Contact</Link></li>
                <li><Link href="/login" className="hover:text-blue-600">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="/login" className="hover:text-blue-600">Documentation</Link></li>
                <li><Link href="/login" className="hover:text-blue-600">Help Center</Link></li>
                <li><Link href="/login" className="hover:text-blue-600">API</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-gray-600">
            <p>© 2025 Alain Business Center. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}












