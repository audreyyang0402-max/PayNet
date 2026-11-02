import type { NextConfig } from "next";

// Known external hosts the app actually talks to — kept in one place so the
// CSP below stays easy to update if the backend or Supabase project changes.
const BACKEND_HOST = "https://payvolution.onrender.com";
const SUPABASE_HOST = "https://imxobwmjctlptqtxmfyh.supabase.co";

// A deliberately moderate Content-Security-Policy: it blocks the dangerous
// defaults (framing, mixed content, arbitrary third-party script/object
// embedding) without being so strict it risks breaking Next.js's own inline
// hydration scripts or Tailwind's compiled styles. Tighten script-src further
// (e.g. with per-request nonces via middleware) once you've tested it holds
// up against the live site — this is a safe baseline, not a final policy.
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${BACKEND_HOST} ${SUPABASE_HOST}`,
  // Menu/QR/banner images aren't restricted to specific hosts on the backend
  // (vendors can set any image URL), so img-src allows any HTTPS source rather
  // than a fixed allowlist — a mismatch here silently blocks real product images.
  "img-src 'self' data: blob: https:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
