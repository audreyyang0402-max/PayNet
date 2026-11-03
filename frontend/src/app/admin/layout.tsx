// src/app/admin/layout.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { isAdminSessionLive, clearAdminSession } from "@/lib/admin-session";

const NAV_ITEMS = [
  { href: "/admin/users", label: "Users", icon: "👥", description: "Manage all platform accounts" },
  { href: "/admin/merchants", label: "Vendors", icon: "🏪", description: "Stalls, menus, slots & QR" },
  { href: "/admin/transactions", label: "Transactions", icon: "💳", description: "Site-wide orders & payments" },
  { href: "/admin/events", label: "Events", icon: "🎉", description: "Campus events & announcements" },
  { href: "/admin/analytics", label: "Analytics", icon: "📊", description: "Orders & revenue insights" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  // Skip layout for the login page
  const isLoginPage = pathname === "/admin/login";

  function forceLogout() {
    clearAdminSession();
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    router.push("/admin/login");
  }

  // Admin sessions are deliberately short-lived: a real page reload always resets
  // the in-memory marker below (see @/lib/admin-session), so even a technically
  // still-valid token in localStorage won't get in past this check after a reload.
  useEffect(() => {
    if (isLoginPage) { setAuthed(true); return; }
    const role = localStorage.getItem("userRole");
    const token = localStorage.getItem("token");
    if (!token || role !== "admin") {
      router.push("/admin/login");
      return;
    }
    if (!isAdminSessionLive()) {
      forceLogout();
      return;
    }
    setAuthed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginPage, pathname]);

  // Hard 8-minute ceiling even if the admin never reloads or navigates again.
  useEffect(() => {
    if (isLoginPage) return;
    const timer = setInterval(() => {
      if (!isAdminSessionLive()) forceLogout();
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginPage]);

  if (!authed) return null;
  if (isLoginPage) return <>{children}</>;

  const handleLogout = () => { forceLogout(); };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top nav bar ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Brand */}
            <span className="text-sm font-bold text-gray-900 tracking-tight">
              <span className="text-orange-600">Payvolution</span> Admin
            </span>

            {/* Nav links */}
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? "bg-orange-50 text-orange-700"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition"
            >
              👁 View Marketplace
            </a>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 uppercase tracking-wide">
              Admin
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-700 transition font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
