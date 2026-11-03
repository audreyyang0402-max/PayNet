"use client";

import Link from "next/link";
import BackLink from "@/components/BackLink";
import {
  TERMS_TITLE,
  TERMS_SUBTITLE,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  TERMS_CONTACT_HEADING,
  TERMS_CONTACT_INTRO,
  TERMS_CONTACT_EMAIL,
} from "@/lib/terms-content";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-10">

        <div className="mb-8">
          <BackLink href="/vendor/register">Back to Register</BackLink>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">{TERMS_TITLE}</h1>
          <p className="text-gray-500 text-sm mt-1">Last updated: {TERMS_LAST_UPDATED} · {TERMS_SUBTITLE}</p>
        </div>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-bold text-gray-900 mb-2">{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">{TERMS_CONTACT_HEADING}</h2>
            <p>
              {TERMS_CONTACT_INTRO}{" "}
              <a href={`mailto:${TERMS_CONTACT_EMAIL}`} className="text-orange-600 hover:underline">
                {TERMS_CONTACT_EMAIL}
              </a>
              .
            </p>
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
