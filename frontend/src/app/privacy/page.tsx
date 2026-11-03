"use client";

import Link from "next/link";
import BackLink from "@/components/BackLink";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-10">

        <div className="mb-8">
          <BackLink href="/vendor/register">Back to Register</BackLink>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Privacy Policy</h1>
          <p className="text-gray-500 text-sm mt-1">Last updated: November 2026 · Sunway Express Lane by PayVolution</p>
        </div>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">1. Information We Collect</h2>
            <p>When you register, we collect your full name, email address, phone number, and password. When you place orders, we collect order details, timestamps, and payment references. We may also collect basic usage data such as pages visited and actions taken on the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">2. How We Use Your Information</h2>
            <p>We use your information to create and manage your account, process orders, send order notifications and verification codes, provide customer support, and improve the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">3. Sharing of Information</h2>
            <p>We share your name and order details with the campus merchant fulfilling your order. We do not sell your personal data to third parties. We may share data with service providers (such as email and hosting providers) strictly to operate the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">4. Data Storage and Security</h2>
            <p>Your data is stored securely using Supabase. We implement reasonable technical measures to protect your information from unauthorised access, alteration, or disclosure. However, no system is completely secure.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">5. Cookies</h2>
            <p>The Platform may use session tokens stored in your browser's local storage to keep you logged in. We do not use third-party tracking cookies.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">6. Your Rights</h2>
            <p>You have the right to access, correct, or request deletion of your personal data at any time. To exercise these rights, contact us at the email below.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">7. Retention</h2>
            <p>We retain your account data for as long as your account is active. Order history may be retained for up to 12 months for operational purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">8. Children's Privacy</h2>
            <p>The Platform is intended for users aged 17 and above (secondary school and university level). We do not knowingly collect data from children under 13.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">9. Changes to this Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">10. Contact</h2>
            <p>For privacy-related questions or requests, contact us at <a href="mailto:payvolutionwebsite@gmail.com" className="text-orange-600 hover:underline">payvolutionwebsite@gmail.com</a>.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 text-center">
          <Link
            href="/vendor/register"
            className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
          >
            Back to Register
          </Link>
        </div>
      </div>
    </main>
  );
}
