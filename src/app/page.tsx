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
            // User is logged in - redirect to dashboard
            router.replace('/dashboard')
            return
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
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      icon: Bot,
      title: 'AI Autopilot',
      description: 'Smart AI handles 80% of conversations. Qualifies leads, answers questions, books appointments—automatically.',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: TrendingUp,
      title: 'Renewal Revenue',
      description: 'Automated renewal reminders recover 30% more revenue. Never miss an expiry date.',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Workflow,
      title: 'Smart Automation',
      description: 'Build workflows that work. Auto-follow-ups, lead routing, task creation—all automated.',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      gradient: 'from-orange-500 to-red-500',
    },
    {
      icon: BarChart3,
      title: 'Revenue Intelligence',
      description: 'Real-time dashboards show exactly what\'s working. Forecast revenue, track KPIs, optimize performance.',
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50',
      gradient: 'from-indigo-500 to-purple-500',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption, GDPR compliant, SOC 2 ready. Your data is safe with us.',
      color: 'text-teal-700',
      bgColor: 'bg-teal-50',
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
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled ? "bg-white/95 backdrop-blur-lg shadow-sm border-b border-slate-200/60" : "bg-transparent"
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
              <Link href="#features" className="text-slate-600 hover:text-slate-900 font-medium transition-colors">
                Features
              </Link>
              <Link href="#pricing" className="text-slate-600 hover:text-slate-900 font-medium transition-colors">
                Pricing
              </Link>
              <Link href="/privacy-policy" className="text-slate-600 hover:text-slate-900 font-medium transition-colors">
                Privacy
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link href="/login">
                <Button size="sm" className="bg-slate-900 hover:bg-slate-800">
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
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.05),transparent_50%)]" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            {/* Badge */}
            <Badge className="mb-6 text-sm px-4 py-2 bg-slate-100 text-slate-700 border-0 font-semibold">
              <Sparkles className="h-3 w-3 mr-2" />
              AI-Powered CRM for UAE Business Services
            </Badge>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight tracking-tight">
              <span className="text-slate-900">
                The CRM That
              </span>
              <br />
              <span className="bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent">
                Works While You Sleep
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-slate-600 mb-8 max-w-3xl mx-auto leading-relaxed font-medium">
              AI handles your WhatsApp, Instagram, and Facebook conversations. 
              <span className="font-bold text-slate-900"> Qualifies leads, books appointments, recovers renewals</span>—all automatically.
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
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-600 font-medium">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 border-2 border-white" />
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
              <ChevronDown className="h-6 w-6 text-slate-400" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-y border-slate-200/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-4">
                  <stat.icon className={cn("h-7 w-7", stat.icon === Zap ? "text-yellow-600" : stat.icon === Target ? "text-green-600" : stat.icon === DollarSign ? "text-blue-600" : "text-purple-600")} />
                </div>
                <div className="text-4xl font-bold text-slate-900 mb-2 tracking-tight">
                  {stat.value}
                </div>
                <div className="text-sm text-slate-600 font-semibold">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Channels Section */}
      <section className="py-20 bg-gradient-to-b from-white to-slate-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">
              All Your Channels, One Inbox
            </h2>
            <p className="text-xl text-slate-600 font-medium">
              WhatsApp, Instagram, Facebook, Email—unified. Never switch tabs again.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {channels.map((channel, i) => (
              <div key={i} className="group relative">
                <div className="absolute inset-0 bg-slate-100/50 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
                <div className="relative bg-white p-6 rounded-2xl border border-slate-200/60 hover:border-slate-300 hover:shadow-lg transition-all">
                  <channel.icon className={cn("h-12 w-12 mb-4 mx-auto", channel.color)} />
                  <div className="text-lg font-bold text-slate-900">{channel.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <Badge className="mb-4 bg-slate-100 text-slate-700 border-0 font-semibold">Powerful Features</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">
              Everything You Need to Scale
            </h2>
            <p className="text-xl text-slate-600 font-medium">
              Built specifically for UAE business services. Visa, renewals, business setup—all automated.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {features.map((feature, i) => (
              <div
                key={i}
                className={cn(
                  "group relative p-6 rounded-2xl border-2 transition-all cursor-pointer bg-white",
                  activeFeature === i
                    ? "border-slate-900 shadow-xl scale-[1.02]"
                    : "border-slate-200/60 hover:border-slate-300 hover:shadow-lg"
                )}
                onClick={() => setActiveFeature(i)}
              >
                <div className={cn("absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity", `bg-gradient-to-br from-${feature.gradient.split(' ')[1]}-500/5 to-${feature.gradient.split(' ')[3]}-500/5`)} />
                <div className="relative">
                  <div className={cn("inline-flex p-3 rounded-xl mb-4", feature.bgColor)}>
                    <feature.icon className={cn("h-6 w-6", feature.color)} />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-slate-900">{feature.title}</h3>
                  <p className="text-slate-600 font-medium leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Autopilot Section */}
      <section className="py-24 bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge className="mb-4 bg-slate-100 text-slate-700 border-0 font-semibold">
                  <Bot className="h-3 w-3 mr-2" />
                  AI Autopilot
                </Badge>
                <h2 className="text-4xl md:text-5xl font-bold mb-6 text-slate-900 tracking-tight">
                  Your AI Assistant That Never Sleeps
                </h2>
                <p className="text-xl text-slate-600 mb-8 font-medium leading-relaxed">
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
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-slate-700 font-medium">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  <Link href="/login">
                    <Button size="lg" className="bg-slate-900 hover:bg-slate-800">
                      Try AI Autopilot Free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-slate-100/50 rounded-3xl blur-3xl" />
                <div className="relative bg-white rounded-2xl p-8 shadow-2xl border border-slate-200/60">
                  <div className="space-y-4">
                    {[
                      { role: 'customer', text: 'Hi, I need help with visa renewal', time: '2:34 PM' },
                      { role: 'ai', text: 'Hello! I\'d be happy to help with your visa renewal. May I know your current visa type and expiry date?', time: '2:34 PM', isAI: true },
                      { role: 'customer', text: 'Visit visa, expires Jan 15', time: '2:35 PM' },
                      { role: 'ai', text: 'Got it! I\'ve noted your visit visa expires on Jan 15. Would you like to proceed with renewal? I can send you a quotation.', time: '2:35 PM', isAI: true },
                    ].map((msg, i) => (
                      <div key={i} className={cn("flex gap-3", msg.role === 'customer' ? 'justify-end' : 'justify-start')}>
                        {msg.role === 'ai' && (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-md">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-3",
                          msg.role === 'customer'
                            ? "bg-slate-900 text-white shadow-md"
                            : "bg-slate-100 text-slate-900 shadow-sm"
                        )}>
                          <p className="text-sm font-medium">{msg.text}</p>
                          <p className={cn("text-xs mt-1.5 font-medium", msg.role === 'customer' ? 'text-slate-300' : 'text-slate-500')}>
                            {msg.time}
                          </p>
                        </div>
                        {msg.role === 'customer' && (
                          <div className="w-8 h-8 rounded-full bg-slate-300 flex-shrink-0" />
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
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">
              Loved by 500+ Businesses
            </h2>
            <p className="text-xl text-slate-600 font-medium">
              See what our customers say about us
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl p-6 border border-slate-200/60 hover:shadow-xl transition-all">
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <Quote className="h-8 w-8 text-slate-300 mb-4" />
                <p className="text-slate-700 mb-6 leading-relaxed font-medium">
                  "{testimonial.content}"
                </p>
                <div>
                  <div className="font-bold text-slate-900">{testimonial.name}</div>
                  <div className="text-sm text-slate-600 font-medium">
                    {testimonial.role} at {testimonial.company}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to 10x Your Business?
            </h2>
            <p className="text-xl mb-8 text-slate-200 font-medium">
              Join 500+ businesses using AI to automate customer conversations and recover lost revenue.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" className="text-lg px-8 py-6 bg-white text-slate-900 hover:bg-slate-100 shadow-xl font-semibold">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-white text-white hover:bg-white/10 font-semibold">
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-slate-300 text-sm font-medium">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
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
          <div className="border-t border-slate-800 pt-8 text-center text-sm font-medium">
            <p>© {new Date().getFullYear()} IMPLSE AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
    )
}
