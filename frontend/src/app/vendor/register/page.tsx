// frontend/src/app/register/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<"customer" | "merchant" | "popup">("customer");
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Determine endpoint and payload based on account type
      const isMerchant = accountType === "merchant";
      const endpoint = isMerchant 
        ? "http://127.0.0.1:8000/auth/register-merchant" 
        : "http://127.0.0.1:8000/users";

      const payload = isMerchant ? {
        name,
        email,
        password,
        store_name: storeName,
        location,
        role: "merchant"
      } : {
        name,
        email,
        phone_number: phoneNumber,
        password,
        role: "customer" // Pop-up vendors register as customers first to rent a stall
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Registration failed.");
      }

      // 2. Auto-login to obtain JWT token immediately
      const loginRes = await fetch("http://127.0.0.1:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        throw new Error("Registration succeeded, but auto-login failed. Please log in manually.");
      }

      const loginData = await loginRes.json();
      localStorage.setItem("token", loginData.access_token);
      localStorage.setItem("userRole", loginData.role);
      localStorage.setItem("userName", loginData.name);

      // 3. Smart Routing Redirection based on selected account type
      if (accountType === "popup") {
        router.push("/vendor/rental");
      } else if (accountType === "merchant") {
        router.push("/vendor/dashboard");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during registration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create an Account</h1>
          <p className="text-gray-500 text-sm mt-1">Choose your account type to get started.</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* 3-Way Account Type Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">I want to register as a:</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAccountType("customer")}
              className={`py-2 px-1 rounded-xl font-semibold text-xs transition-all cursor-pointer text-center ${
                accountType === "customer"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🎓 Customer
            </button>

            <button
              type="button"
              onClick={() => setAccountType("merchant")}
              className={`py-2 px-1 rounded-xl font-semibold text-xs transition-all cursor-pointer text-center ${
                accountType === "merchant"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🏪 Merchant
            </button>

            <button
              type="button"
              onClick={() => setAccountType("popup")}
              className={`py-2 px-1 rounded-xl font-semibold text-xs transition-all cursor-pointer text-center ${
                accountType === "popup"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🎪 Pop-up Vendor
            </button>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>

          {accountType !== "merchant" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Phone Number</label>
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+60123456789"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>

          {accountType === "merchant" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Store / Stall Name</label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Kai Fan Shop"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Location on Campus</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Fresco"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Already have an account?{" "}
            <Link href="/vendor/login" className="text-orange-600 font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>

      </div>
    </main>
  );
}