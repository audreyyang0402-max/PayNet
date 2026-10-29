// frontend/src/app/vendor/register/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function VendorRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"accountType" | "details" | "verification">("accountType");
  const [accountType, setAccountType] = useState<"customer" | "merchant" | "popup">("customer");
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSendVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          purpose: "register",
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to send verification code");
      }

      setStep("verification");
      // Store details in sessionStorage
      sessionStorage.setItem("registerData", JSON.stringify({ 
        name, 
        email, 
        phoneNumber, 
        password,
        storeName,
        location,
        accountType
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: verificationCode,
          purpose: "register",
          name,
          password,
          phone_number: phoneNumber,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Verification failed");
        return;
      }

      // Save token
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user_id", data.user_id);
      
      // Clear sessionStorage
      sessionStorage.removeItem("registerData");
      
      // Redirect based on account type
      if (accountType === "popup") {
        router.push("/vendor/rental");
      } else if (accountType === "merchant") {
        router.push("/vendor/dashboard");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          purpose: "register",
        }),
      });

      if (res.ok) {
        alert("Code resent to your email!");
      } else {
        setError("Failed to resend code");
      }
    } catch (err) {
      setError("Error resending code");
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create an Account</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === "accountType" ? "Choose your account type to get started." : `Register as a ${accountType === "popup" ? "Pop-up Vendor" : accountType === "merchant" ? "Merchant" : "Customer"}`}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* STEP 1: ACCOUNT TYPE SELECTION */}
        {step === "accountType" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">I want to register as a:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAccountType("customer");
                    setStep("details");
                  }}
                  className="py-3 px-2 rounded-xl font-semibold text-xs transition-all cursor-pointer text-center bg-orange-600 text-white shadow-md hover:bg-orange-700"
                >
                  🎓 Customer
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAccountType("merchant");
                    setStep("details");
                  }}
                  className="py-3 px-2 rounded-xl font-semibold text-xs transition-all cursor-pointer text-center bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  🏪 Merchant
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAccountType("popup");
                    setStep("details");
                  }}
                  className="py-3 px-2 rounded-xl font-semibold text-xs transition-all cursor-pointer text-center bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  🎪 Pop-up Vendor
                </button>
              </div>
            </div>

            <div className="text-center pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Already have an account?{" "}
                <Link href="/login" className="text-orange-600 font-semibold hover:underline">
                  Log in
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: DETAILS FORM */}
        {step === "details" && (
          <form onSubmit={handleSendVerificationCode} className="space-y-4">
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

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep("accountType")}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 rounded-xl text-sm cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: VERIFICATION */}
        {step === "verification" && (
          <form onSubmit={handleVerifyAndRegister} className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-center">
              <p className="text-green-700 text-xs font-medium">✅ Code sent to {email}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Verification Code</label>
              <input
                type="text"
                maxLength={6}
                required
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 text-center text-2xl font-bold tracking-widest border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-1">Code expires in 5 minutes</p>
            </div>

            <button
              type="submit"
              disabled={loading || verificationCode.length !== 6}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Verify & Create Account"}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full text-orange-600 hover:text-orange-700 font-semibold text-sm py-2 disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend Code"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("details");
                setVerificationCode("");
                setError("");
              }}
              className="w-full text-gray-600 hover:text-gray-700 font-semibold text-sm py-2"
            >
              Go Back
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
