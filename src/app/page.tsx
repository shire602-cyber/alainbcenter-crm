'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  MessageSquare,
  Zap,
  Shield,
  TrendingUp, 
  Users, 
  CheckCircle2,
  Sparkles,
  BarChart3,
  Globe,
  Smartphone,
  Mail,
  Instagram,
  Facebook,
  ArrowRight,
  Star,
  Building2,
  Clock, 
  Target,
  DollarSign,
  Bot,
  Workflow,
  FileText,
  Bell,
  Lock,
  Play,
  ChevronDown,
  Quote,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  const router = useRouter()
  const [activeFeature, setActiveFeature] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Check if user is authenticated
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) {
          const user = await res.json()
          if (user && user.id) {
            // User is logged in - redirect to dashboard (or show dashboard)
            // For now, we'll keep showing landing page but logged-in users can click "Dashboard" in nav
            setIsAuthenticated(true)
          } else {
            setIsAuthenticated(false)
          }
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
    }
    checkAuth()
  }, [])

  const features = [
    {
      icon: MessageSquare,
      title: 'Unified Inbox',
      description: 'WhatsApp, Instagram, Facebook, Email—all in one place. Never miss a conversation.',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      icon: Bot,
      title: 'AI Autopilot',
      description: 'Smart AI handles 80% of conversations. Qualifies leads, answers questions, books appointments—automatically.',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: TrendingUp,
      title: 'Renewal Revenue',
      description: 'Automated renewal reminders recover 30% more revenue. Never miss an expiry date.',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Workflow,
      title: 'Smart Automation',
      description: 'Build workflows that work. Auto-follow-ups, lead routing, task creation—all automated.',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      gradient: 'from-orange-500 to-red-500',
    },
    {
      icon: BarChart3,
      title: 'Revenue Intelligence',
      description: 'Real-time dashboards show exactly what\'s working. Forecast revenue, track KPIs, optimize performance.',
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      gradient: 'from-indigo-500 to-purple-500',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption, GDPR compliant, SOC 2 ready. Your data is safe with us.',
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
      gradient: 'from-teal-500 to-green-500',
    },
  ]

  const channels = [
    { icon: MessageSquare, name: 'WhatsApp', color: 'text-green-600' },
    { icon: Instagram, name: 'Instagram', color: 'text-pink-600' },
    { icon: Facebook, name: 'Facebook', color: 'text-blue-600' },
    { icon: Mail, name: 'Email', color: 'text-gray-600' },
  ]

  const stats = [
    { value: '10x', label: 'Faster Response', icon: Zap },
    { value: '40%', label: 'More Conversions', icon: Target },
    { value: '30%', label: 'Revenue Recovery', icon: DollarSign },
    { value: '24/7', label: 'AI Availability', icon: Clock },
  ]

  const testimonials = [
    {
      name: 'Sarah Al Mansoori',
      role: 'Business Owner',
      company: 'Dubai Services Co.',
      content: 'We went from missing 50% of leads to closing 80% more deals. The AI handles everything automatically.',
      rating: 5,
    },
    {
      name: 'Ahmed Hassan',
      role: 'Operations Manager',
      company: 'UAE Business Center',
      content: 'The renewal automation alone paid for itself in the first month. We recovered AED 200K in lost renewals.',
      rating: 5,
    },
    {
      name: 'Fatima Al Zaabi',
      role: 'Customer Success',
      company: 'Visa Services Pro',
      content: 'Our response time went from 4 hours to 2 minutes. Customers love the instant AI replies.',
      rating: 5,
    },
  ]

    return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled ? "bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg shadow-sm" : "bg-transparent"
      )}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img 
                src="/implse-ai-logo.svg" 
                alt="IMPLSE AI" 
                className="h-8 w-auto"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const parent = target.parentElement
                  if (parent && !parent.querySelector('.logo-fallback')) {
                    const fallback = document.createElement('div')
                    fallback.className = 'logo-fallback w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center'
                    fallback.innerHTML = '<span class="text-white font-bold text-sm">A</span>'
                    parent.appendChild(fallback)
                  }
                }}
              />
            </div>
            <div className="hidden md:flex items-center gap-6">
              <Link href="#features" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Features
              </Link>
              <Link href="#pricing" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Pricing
              </Link>
              <Link href="/privacy-policy" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Privacy
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link href="/login">
                <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.1),transparent_50%)]" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            {/* Badge */}
            <Badge className="mb-6 text-sm px-4 py-1.5 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 dark:from-blue-900/30 dark:to-purple-900/30 dark:text-blue-300 border-0">
              <Sparkles className="h-3 w-3 mr-2" />
              AI-Powered CRM for UAE Business Services
            </Badge>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 dark:from-white dark:via-blue-200 dark:to-purple-200 bg-clip-text text-transparent">
                The CRM That
              </span>
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Works While You Sleep
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              AI handles your WhatsApp, Instagram, and Facebook conversations. 
              <span className="font-semibold text-gray-900 dark:text-white"> Qualifies leads, books appointments, recovers renewals</span>—all automatically.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link href="/login">
                <Button size="lg" className="text-lg px-8 py-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/50">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2">
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </Link>
            </div>

            {/* Social Proof */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 border-2 border-white dark:border-gray-900" />
                  ))}
                </div>
                <span>500+ businesses trust us</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="ml-1">4.9/5 rating</span>
              </div>
            </div>

            {/* Scroll Indicator */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
              <ChevronDown className="h-6 w-6 text-gray-400" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white dark:bg-gray-900 border-y">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 mb-4">
                  <stat.icon className={cn("h-6 w-6", stat.icon === Zap ? "text-yellow-600" : stat.icon === Target ? "text-green-600" : stat.icon === DollarSign ? "text-blue-600" : "text-purple-600")} />
                </div>
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Channels Section */}
      <section className="py-20 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              All Your Channels, One Inbox
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              WhatsApp, Instagram, Facebook, Email—unified. Never switch tabs again.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {channels.map((channel, i) => (
              <div key={i} className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all hover:shadow-xl">
                  <channel.icon className={cn("h-12 w-12 mb-4 mx-auto", channel.color)} />
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{channel.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <Badge className="mb-4">Powerful Features</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Everything You Need to Scale
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Built specifically for UAE business services. Visa, renewals, business setup—all automated.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {features.map((feature, i) => (
              <div
                key={i}
                className={cn(
                  "group relative p-6 rounded-2xl border-2 transition-all cursor-pointer",
                  activeFeature === i
                    ? "border-blue-500 dark:border-blue-400 shadow-xl scale-105"
                    : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                )}
                onClick={() => setActiveFeature(i)}
              >
                <div className={cn("absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity", `from-${feature.gradient.split(' ')[1]}-500/10 to-${feature.gradient.split(' ')[3]}-500/10`)} />
                <div className="relative">
                  <div className={cn("inline-flex p-3 rounded-xl mb-4", feature.bgColor)}>
                    <feature.icon className={cn("h-6 w-6", feature.color)} />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Autopilot Section */}
      <section className="py-24 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge className="mb-4 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 dark:from-purple-900/30 dark:to-pink-900/30 dark:text-purple-300">
                  <Bot className="h-3 w-3 mr-2" />
                  AI Autopilot
                </Badge>
                <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                  Your AI Assistant That Never Sleeps
                </h2>
                <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                  Our AI handles conversations 24/7. Qualifies leads, answers questions, books appointments—all automatically. You only step in when needed.
                </p>
                <div className="space-y-4">
                  {[
                    'Qualifies leads automatically',
                    'Answers common questions instantly',
                    'Books appointments and consultations',
                    'Sends renewal reminders',
                    'Routes complex queries to humans',
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-gray-700 dark:text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  <Link href="/login">
                    <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                      Try AI Autopilot Free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl blur-3xl" />
                <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-200 dark:border-gray-700">
                  <div className="space-y-4">
                    {[
                      { role: 'customer', text: 'Hi, I need help with visa renewal', time: '2:34 PM' },
                      { role: 'ai', text: 'Hello! I\'d be happy to help with your visa renewal. May I know your current visa type and expiry date?', time: '2:34 PM', isAI: true },
                      { role: 'customer', text: 'Visit visa, expires Jan 15', time: '2:35 PM' },
                      { role: 'ai', text: 'Got it! I\'ve noted your visit visa expires on Jan 15. Would you like to proceed with renewal? I can send you a quotation.', time: '2:35 PM', isAI: true },
                    ].map((msg, i) => (
                      <div key={i} className={cn("flex gap-3", msg.role === 'customer' ? 'justify-end' : 'justify-start')}>
                        {msg.role === 'ai' && (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-3",
                          msg.role === 'customer'
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                        )}>
                          <p className="text-sm">{msg.text}</p>
                          <p className={cn("text-xs mt-1", msg.role === 'customer' ? 'text-blue-100' : 'text-gray-500')}>
                            {msg.time}
                          </p>
                        </div>
                        {msg.role === 'customer' && (
                          <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Loved by 500+ Businesses
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              See what our customers say about us
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all">
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <Quote className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
                  "{testimonial.content}"
                </p>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{testimonial.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {testimonial.role} at {testimonial.company}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to 10x Your Business?
            </h2>
            <p className="text-xl mb-8 text-blue-100">
              Join 500+ businesses using AI to automate customer conversations and recover lost revenue.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" className="text-lg px-8 py-6 bg-white text-blue-600 hover:bg-gray-100 shadow-xl">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-white text-white hover:bg-white/10">
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-blue-100 text-sm">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img 
                  src="/implse-ai-logo.svg" 
                  alt="IMPLSE AI" 
                  className="h-8 w-auto brightness-0 invert"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const parent = target.parentElement
                    if (parent && !parent.querySelector('.logo-fallback')) {
                      const fallback = document.createElement('div')
                      fallback.className = 'logo-fallback w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center'
                      fallback.innerHTML = '<span class="text-white font-bold text-sm">A</span>'
                      parent.appendChild(fallback)
                    }
                  }}
                />
              </div>
              <p className="text-sm">
                AI-powered CRM for UAE business services. Automate conversations, recover revenue, scale your business.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><a href="mailto:ashire@alainbcenter.com" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Connect</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:ashire@alainbcenter.com" className="hover:text-white transition-colors">Email Us</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>© {new Date().getFullYear()} IMPLSE AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
    )
}
