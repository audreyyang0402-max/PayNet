"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-10">

        <div className="mb-8">
          <Link href="/vendor/register" className="text-sm text-orange-600 hover:underline">← Back to Register</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Terms and Conditions</h1>
          <p className="text-gray-500 text-sm mt-1">Last updated: November 2026 · Sunway Express Lane by PayVolution</p>
        </div>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>By creating an account and using the Sunway Express Lane platform ("Platform"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">2. Use of the Platform</h2>
            <p>The Platform is provided for students, staff, and visitors of Sunway University and Sunway College to browse and order food and beverages from campus merchants. You agree to use the Platform only for lawful purposes and in accordance with these Terms.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">3. Account Registration</h2>
            <p>You must provide accurate and complete information when registering an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">4. Orders and Payments</h2>
            <p>All orders placed through the Platform are subject to availability. Prices displayed are set by individual merchants and may change without notice. Payment is processed at the time of order. Refunds and cancellations are subject to each merchant's individual policy.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">5. Pickup and Collection</h2>
            <p>Orders are for campus pickup only. You are responsible for collecting your order within the designated pickup window. The Platform is not responsible for uncollected orders.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">6. User Conduct</h2>
            <p>You agree not to misuse the Platform, submit false information, or engage in any conduct that disrupts the service or harms other users or merchants. Violations may result in account suspension.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">7. Intellectual Property</h2>
            <p>All content on the Platform, including logos, graphics, and text, is the property of PayVolution or its licensors and may not be reproduced without permission.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">8. Limitation of Liability</h2>
            <p>The Platform is provided "as is". PayVolution makes no warranties regarding uptime, accuracy, or fitness for a particular purpose. To the maximum extent permitted by law, PayVolution shall not be liable for any indirect or consequential damages arising from your use of the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">9. Changes to Terms</h2>
            <p>We reserve the right to update these Terms at any time. Continued use of the Platform after changes constitutes your acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">10. Contact</h2>
            <p>For questions about these Terms, please contact us at <a href="mailto:payvolutionwebsite@gmail.com" className="text-orange-600 hover:underline">payvolutionwebsite@gmail.com</a>.</p>
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
