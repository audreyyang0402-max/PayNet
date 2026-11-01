// src/components/SiteFooter.tsx
// Shared footer for customer-facing pages: creator info, contact & T&C summary.

"use client";

import { useState } from "react";

export default function SiteFooter() {
  const [tcOpen, setTcOpen] = useState(false);

  return (
    <>
      <footer className="mt-12 border-t border-stone-200 bg-white/80 backdrop-blur-sm px-4 py-8 text-xs text-stone-500">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Top row: brand + links */}
          <div className="flex flex-wrap items-start justify-between gap-6">

            {/* Brand */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-600 text-[11px] font-black text-white">P</span>
                <span className="font-bold text-stone-800 text-sm">Payvolution</span>
              </div>
              <p className="max-w-xs leading-relaxed text-stone-400">
                Sunway Express Lane — a campus food ordering platform built to make your meal experience faster and easier.
              </p>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[11px]">
              <div className="space-y-2">
                <p className="font-bold uppercase tracking-widest text-stone-400">Platform</p>
                <a href="/" className="block hover:text-orange-600 transition-colors">Marketplace</a>
                <a href="/profile" className="block hover:text-orange-600 transition-colors">My Profile</a>
                <a href="/orders" className="block hover:text-orange-600 transition-colors">My Orders</a>
              </div>
              <div className="space-y-2">
                <p className="font-bold uppercase tracking-widest text-stone-400">Support</p>
                <a href="mailto:payvolutionwebsite@gmail.com" className="block hover:text-orange-600 transition-colors">Email Us</a>
                <button
                  type="button"
                  onClick={() => setTcOpen(true)}
                  className="block hover:text-orange-600 transition-colors text-left"
                >
                  Terms &amp; Conditions
                </button>
                <a href="/forgot-password" className="block hover:text-orange-600 transition-colors">Reset Password</a>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-stone-100" />

          {/* Bottom row: creator + legal note */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              Built with ❤️ by{" "}
              <a
                href="mailto:payvolutionwebsite@gmail.com"
                className="font-semibold text-orange-600 hover:underline"
              >
                Payvolution Team
              </a>
              {" "}· Sunway College, SDS
            </p>
            <p className="text-stone-400">
              © {new Date().getFullYear()} Payvolution. All rights reserved.
            </p>
          </div>

          {/* T&C agreement notice */}
          <p className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 leading-relaxed text-stone-400">
            By creating an account or using this platform, you agree to our{" "}
            <button
              type="button"
              onClick={() => setTcOpen(true)}
              className="font-semibold text-orange-600 underline underline-offset-2 hover:text-orange-700"
            >
              Terms &amp; Conditions
            </button>
            {" "}and confirm that the information you provide is accurate. Payvolution is a campus food ordering service — all orders are for food pickup only.
          </p>
        </div>
      </footer>

      {/* Terms & Conditions modal */}
      {tcOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setTcOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 sm:p-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setTcOpen(false)}
              className="absolute right-4 top-4 h-8 w-8 rounded-full bg-stone-100 text-stone-500 font-bold hover:bg-stone-200 flex items-center justify-center"
            >
              ✕
            </button>

            <h2 className="text-xl font-black text-stone-900">Terms &amp; Conditions</h2>
            <p className="mt-1 text-xs text-stone-400">Last updated: November 2026 · Payvolution, Sunway College SDS</p>

            <div className="mt-6 space-y-5 text-sm text-stone-700 leading-relaxed">

              <section>
                <h3 className="font-bold text-stone-900">1. Acceptance of Terms</h3>
                <p className="mt-1">By creating an account or placing an order on Payvolution (Sunway Express Lane), you agree to be bound by these Terms &amp; Conditions. If you do not agree, please do not use this platform.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">2. Platform Purpose</h3>
                <p className="mt-1">Payvolution is a campus food ordering and click-and-collect platform exclusively for Sunway College (Sunway Diploma Studies, SDS). All orders are for food pickup only — we do not offer delivery services.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">3. Account Responsibility</h3>
                <p className="mt-1">You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate, current, and complete information when registering. Payvolution reserves the right to suspend or terminate accounts that violate these terms.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">4. Orders &amp; Payments</h3>
                <p className="mt-1">Orders are confirmed only after successful payment via DuitNow QR. Once an order is placed and paid, cancellations are subject to the merchant's discretion. Payvolution is not liable for payment disputes between customers and merchants.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">5. Merchant Content</h3>
                <p className="mt-1">Merchants are responsible for the accuracy of their menu items, prices, and availability. Payvolution does not guarantee the nutritional content, allergen information, or preparation methods of any food item. Customers with food allergies are advised to contact the merchant directly before ordering.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">6. Privacy &amp; Data</h3>
                <p className="mt-1">We collect your name, email, and order data solely to operate this platform. We do not sell your personal information to third parties. Profile photos and dietary preferences are stored locally in your browser and are not uploaded to our servers.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">7. Limitation of Liability</h3>
                <p className="mt-1">Payvolution provides this platform on an "as-is" basis. We are not liable for any loss, damage, or dissatisfaction arising from the use of this platform, including but not limited to order errors, merchant delays, or technical outages.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">8. Changes to Terms</h3>
                <p className="mt-1">We may update these Terms &amp; Conditions from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>
              </section>

              <section>
                <h3 className="font-bold text-stone-900">9. Contact Us</h3>
                <p className="mt-1">
                  For any questions, account issues, or support requests, please reach out to us at{" "}
                  <a href="mailto:payvolutionwebsite@gmail.com" className="font-semibold text-orange-600 underline">
                    payvolutionwebsite@gmail.com
                  </a>
                  .
                </p>
              </section>
            </div>

            <button
              type="button"
              onClick={() => setTcOpen(false)}
              className="mt-8 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700 transition"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </>
  );
}
