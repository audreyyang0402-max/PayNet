// frontend/src/app/register/page.tsx
// Redirect to /vendor/register
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function VendorRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"register" | "verify">("register");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Step 1: Trigger Sign-Up and send Email OTP
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name,
            role: "merchant",
          },
        },
      });

      if (error) throw error;

      // Move to 6-digit OTP verification step
      setStep("verify");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the OTP code entered by the user
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: formData.email,
        token: otp,
        type: "signup",
      });

      if (error) throw error;

      // Save token and user details on successful verification
      if (data.session) {
        localStorage.setItem("token", data.session.access_token);
        localStorage.setItem("userRole", "merchant");
        localStorage.setItem("userName", formData.name);
      }

      // Redirect to vendor login or vendor dashboard
      router.push("/vendor/login");
    } catch (err: any) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6 text-center">
          <span className="bg-orange-50 text-orange-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Vendor Portal
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            {step === "register" ? "Create Merchant Account" : "Verify Email"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === "register"
              ? "Register your stall to start selling"
              : `Enter the code sent to ${formData.email}`}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 border border-red-100 text-sm font-medium">
            {error}
          </div>
        )}

        {step === "register" ? (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Full Name / Stall Name
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                placeholder="e.g. Uncle Lim Chicken Rice"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                placeholder="name@sunway.edu.my"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl transition-all shadow-sm cursor-pointer mt-2 text-sm"
            >
              {loading ? "Sending Code..." : "Register & Get Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-2 text-center">
                Verification Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900"
                placeholder="123456"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-all shadow-sm cursor-pointer mt-2 text-sm"
            >
              {loading ? "Verifying..." : "Verify & Activate Account"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <Link
            href="/vendor/login"
            className="text-orange-600 font-semibold hover:underline"
          >
            Log in here
          </Link>
        </p>
      </div>
    </main>
  );
}