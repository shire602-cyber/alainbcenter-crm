import { Metadata } from 'next'
import { Shield, Lock, Eye, Users, Globe, FileText } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy | Alain Business Center',
  description: 'Privacy Policy for Alain Business Center CRM - Compliant with Meta, Instagram, and WhatsApp Business policies',
}

export default function PrivacyPolicyPage() {
  const lastUpdated = 'January 7, 2025'
  const companyName = 'IMPLSE AI'
  const companyAddress = 'Al Ain, United Arab Emirates'
  const contactEmail = 'ashire@alainbcenter.com'

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-4">
            <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Privacy Policy
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Last Updated: {lastUpdated}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-lg max-w-none dark:prose-invert">
          {/* Introduction */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              1. Introduction
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {companyName} ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our customer relationship management (CRM) services, including our integrations with Meta platforms (Facebook, Instagram, WhatsApp Business), and our website.
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              By using our services, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our services.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Eye className="h-6 w-6 text-blue-600" />
              2. Information We Collect
            </h2>
            
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">
              2.1 Information You Provide
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Contact Information:</strong> Name, email address, phone number, postal address</li>
              <li><strong>Business Information:</strong> Company name, business type, service requirements</li>
              <li><strong>Communication Data:</strong> Messages, inquiries, and other communications sent through our platforms</li>
              <li><strong>Documentation:</strong> Documents, identification, and other files you upload</li>
              <li><strong>Account Information:</strong> Username, password, and account preferences</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">
              2.2 Information from Meta Platforms (Facebook, Instagram, WhatsApp)
            </h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              When you interact with us through Meta platforms, we may receive:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>WhatsApp Messages:</strong> Messages, media files, and metadata from WhatsApp Business conversations</li>
              <li><strong>Instagram Messages:</strong> Direct messages and interactions from Instagram</li>
              <li><strong>Facebook Lead Ads:</strong> Lead information submitted through Facebook Lead Ads forms</li>
              <li><strong>Profile Information:</strong> Public profile information available through Meta's APIs</li>
              <li><strong>Message Status:</strong> Delivery, read, and sent status of messages</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-500">
              <strong>Note:</strong> We only collect information that you explicitly provide or that is necessary for providing our services. We comply with Meta's Data Use Policy and Terms of Service.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">
              2.3 Automatically Collected Information
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Usage Data:</strong> How you interact with our services, pages visited, features used</li>
              <li><strong>Device Information:</strong> IP address, browser type, device type, operating system</li>
              <li><strong>Log Data:</strong> Server logs, error logs, and diagnostic information</li>
              <li><strong>Cookies and Tracking:</strong> Cookies, web beacons, and similar tracking technologies</li>
            </ul>
          </section>

          {/* How We Use Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              3. How We Use Your Information
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              We use the information we collect for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Service Delivery:</strong> To provide, maintain, and improve our CRM and business services</li>
              <li><strong>Communication:</strong> To respond to your inquiries, send service updates, and communicate about your account</li>
              <li><strong>Customer Support:</strong> To provide customer support and technical assistance</li>
              <li><strong>Business Operations:</strong> To process transactions, manage accounts, and fulfill service requests</li>
              <li><strong>Legal Compliance:</strong> To comply with legal obligations, enforce our terms, and protect our rights</li>
              <li><strong>Analytics:</strong> To analyze usage patterns, improve services, and develop new features</li>
              <li><strong>Marketing:</strong> To send promotional communications (with your consent, where required)</li>
              <li><strong>AI Processing:</strong> To power AI-driven features like automated replies, lead qualification, and customer insights (using secure, encrypted processing)</li>
            </ul>
          </section>

          {/* Meta Platform Integration */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Globe className="h-6 w-6 text-blue-600" />
              4. Meta Platform Integration (Facebook, Instagram, WhatsApp)
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              Our services integrate with Meta platforms to provide seamless communication and lead management:
            </p>
            
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">
              4.1 WhatsApp Business API
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>We use WhatsApp Business API to send and receive messages</li>
              <li>Messages are stored securely in our CRM system for customer service purposes</li>
              <li>We comply with WhatsApp's Business Policy and Terms of Service</li>
              <li>You can opt-out of WhatsApp communications at any time</li>
              <li>We use approved message templates for outbound communications outside the 24-hour window</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">
              4.2 Instagram Management
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>We manage Instagram direct messages and interactions on behalf of businesses</li>
              <li>We process Instagram messages for customer service and lead management</li>
              <li>We comply with Instagram's Terms of Use and Community Guidelines</li>
              <li>All Instagram data is handled in accordance with Meta's Data Use Policy</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">
              4.3 Facebook Lead Ads
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>We receive lead information from Facebook Lead Ads campaigns</li>
              <li>Lead data is processed and stored in our CRM system</li>
              <li>We comply with Facebook's Lead Ads Terms and Data Use Policy</li>
              <li>Lead information is used solely for business purposes related to the service inquiry</li>
            </ul>

            <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-l-4 border-yellow-500">
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Meta Data Sharing:</strong> We do not sell your personal information to Meta or any third parties. We only use Meta's APIs to provide our services and comply with all Meta platform policies.
              </p>
            </div>
          </section>

          {/* Data Sharing */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              5. Data Sharing and Disclosure
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              We do not sell your personal information. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Service Providers:</strong> With trusted third-party service providers who assist in operating our services (e.g., cloud hosting, payment processing)</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets (with notice to users)</li>
              <li><strong>Protection of Rights:</strong> To protect our rights, property, or safety, or that of our users</li>
              <li><strong>With Your Consent:</strong> When you explicitly consent to sharing</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              <strong>Meta Platforms:</strong> We share information with Meta only as necessary to provide our services through their APIs, in compliance with Meta's policies and your privacy settings.
            </p>
          </section>

          {/* Data Security */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Lock className="h-6 w-6 text-blue-600" />
              6. Data Security
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Encryption:</strong> Data is encrypted in transit (TLS/SSL) and at rest</li>
              <li><strong>Access Controls:</strong> Strict access controls and authentication mechanisms</li>
              <li><strong>Secure Storage:</strong> Data stored in secure, compliant cloud infrastructure</li>
              <li><strong>Regular Audits:</strong> Security audits and vulnerability assessments</li>
              <li><strong>Employee Training:</strong> Staff trained on data protection and privacy</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          {/* Your Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              7. Your Privacy Rights
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Opt-out of marketing communications and certain data processing</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              To exercise these rights, please contact us at <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>. We will respond to your request within 30 days.
            </p>
          </section>

          {/* Data Retention */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              8. Data Retention
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              We retain your personal information only for as long as necessary to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Provide our services and fulfill our contractual obligations</li>
              <li>Comply with legal, tax, and regulatory requirements</li>
              <li>Resolve disputes and enforce our agreements</li>
              <li>Maintain business records for legitimate business purposes</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              When data is no longer needed, we securely delete or anonymize it in accordance with our data retention policies.
            </p>
          </section>

          {/* Cookies */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              9. Cookies and Tracking Technologies
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Remember your preferences and settings</li>
              <li>Analyze website traffic and usage patterns</li>
              <li>Improve user experience and service functionality</li>
              <li>Provide personalized content and features</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              You can control cookies through your browser settings. However, disabling cookies may limit your ability to use certain features of our services.
            </p>
          </section>

          {/* International Transfers */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              10. International Data Transfers
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence. We ensure that appropriate safeguards are in place to protect your data in accordance with this Privacy Policy and applicable data protection laws, including Standard Contractual Clauses where required.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              11. Children's Privacy
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately, and we will take steps to delete such information.
            </p>
          </section>

          {/* Changes to Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              12. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. We encourage you to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          {/* Contact Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              13. Contact Us
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>{companyName}</strong>
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                {companyAddress}
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                Email: <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>
              </p>
            </div>
          </section>

          {/* Meta Compliance Statement */}
          <section className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-500">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Meta Platform Compliance
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              This Privacy Policy is designed to comply with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
              <li>Meta's Data Use Policy</li>
              <li>WhatsApp Business Policy and Terms of Service</li>
              <li>Instagram Terms of Use and Data Policy</li>
              <li>Facebook Platform Policy and Lead Ads Terms</li>
              <li>General Data Protection Regulation (GDPR)</li>
              <li>UAE Data Protection Laws</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
              We are committed to maintaining compliance with all applicable privacy laws and platform policies.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
          <p>© {new Date().getFullYear()} {companyName}. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

