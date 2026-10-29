// frontend/src/app/verify-email/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface RegisterData {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [registerData, setRegisterData] = useState<RegisterData | null>(null);

  useEffect(() => {
    // Get registration data from sessionStorage
    const stored = sessionStorage.getItem("registerData");
    if (stored) {
      setRegisterData(JSON.parse(stored));
    }
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          purpose: "register",
          name: registerData?.name,
          password: registerData?.password,
          phone_number: registerData?.phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Verification failed");
        return;
      }

      // Save token and user info
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user_id", data.user_id);
      
      // Clear registration data from sessionStorage
      sessionStorage.removeItem("registerData");
      
      // Redirect to home
      router.push("/");
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMessage("");
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
        setResendMessage("Code resent to your email!");
      } else {
        setResendMessage("Failed to resend code");
      }
    } catch (err) {
      setResendMessage("Error resending code");
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-purple-100 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Email</h1>
          <p className="text-gray-600 text-sm mt-2">
            We sent a 6-digit code to <span className="font-semibold">{email}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {resendMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-6">
            {resendMessage}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-4 py-3 text-center text-2xl font-bold tracking-widest border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">Code expires in 5 minutes</p>
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center mb-4">Didn't receive the code?</p>
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full text-purple-600 hover:text-purple-700 font-semibold text-sm py-2 disabled:opacity-50"
          >
            {resending ? "Sending..." : "Resend Code"}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Wrong email?{" "}
            <Link href="/register" className="text-purple-600 hover:text-purple-700 font-semibold">
              Go back
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<p>Loading verification...</p>}><VerifyEmailContent /></Suspense>;
}
