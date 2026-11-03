"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

const COUNTRY_CODES = [
  { code: "+60", name: "Malaysia" },
  { code: "+93", name: "Afghanistan" },
  { code: "+355", name: "Albania" },
  { code: "+213", name: "Algeria" },
  { code: "+54", name: "Argentina" },
  { code: "+61", name: "Australia" },
  { code: "+43", name: "Austria" },
  { code: "+973", name: "Bahrain" },
  { code: "+880", name: "Bangladesh" },
  { code: "+32", name: "Belgium" },
  { code: "+673", name: "Brunei" },
  { code: "+855", name: "Cambodia" },
  { code: "+1", name: "Canada / USA" },
  { code: "+86", name: "China" },
  { code: "+20", name: "Egypt" },
  { code: "+33", name: "France" },
  { code: "+49", name: "Germany" },
  { code: "+852", name: "Hong Kong" },
  { code: "+91", name: "India" },
  { code: "+62", name: "Indonesia" },
  { code: "+81", name: "Japan" },
  { code: "+962", name: "Jordan" },
  { code: "+82", name: "South Korea" },
  { code: "+965", name: "Kuwait" },
  { code: "+856", name: "Laos" },
  { code: "+961", name: "Lebanon" },
  { code: "+960", name: "Maldives" },
  { code: "+95", name: "Myanmar" },
  { code: "+977", name: "Nepal" },
  { code: "+31", name: "Netherlands" },
  { code: "+64", name: "New Zealand" },
  { code: "+234", name: "Nigeria" },
  { code: "+968", name: "Oman" },
  { code: "+92", name: "Pakistan" },
  { code: "+63", name: "Philippines" },
  { code: "+974", name: "Qatar" },
  { code: "+966", name: "Saudi Arabia" },
  { code: "+65", name: "Singapore" },
  { code: "+27", name: "South Africa" },
  { code: "+34", name: "Spain" },
  { code: "+94", name: "Sri Lanka" },
  { code: "+46", name: "Sweden" },
  { code: "+41", name: "Switzerland" },
  { code: "+886", name: "Taiwan" },
  { code: "+66", name: "Thailand" },
  { code: "+90", name: "Turkey" },
  { code: "+971", name: "UAE" },
  { code: "+44", name: "United Kingdom" },
  { code: "+84", name: "Vietnam" },
].sort((a, b) => (a.name === "Malaysia" ? -1 : a.name.localeCompare(b.name)));

function passwordError(value: string): string {
  if (new TextEncoder().encode(value).length > 72)
    return "Password is too long. Please shorten it.";
  if (
    Array.from(value).length < 12 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/[0-9]/.test(value) ||
    !/[^a-zA-Z0-9\s]/.test(value)
  )
    return "Password: use at least 12 characters, including an uppercase letter, a lowercase letter, a number and a symbol.";
  return "";
}

type Step = "details" | "verification";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("+60");
  const [phoneNum, setPhoneNum] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Full name is required."); return; }

    const issue = passwordError(password);
    if (issue) { setError(issue); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    const cleanPhone = phoneNum.replace(/\D/g, "").replace(/^0+/, "");
    if (!cleanPhone || cleanPhone.length < 6) { setError("Please enter a valid phone number."); return; }

    if (!agreedToTerms) { setError("Please agree to the Terms and Conditions to continue."); return; }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "register" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed to send verification code.");
      }
      setStep("verification");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const issue = passwordError(password);
    if (issue) { setStep("details"); setError(issue); return; }
    if (password !== confirmPassword) { setStep("details"); setError("Passwords do not match."); return; }
    if (!/^[0-9]{6,8}$/.test(verificationCode)) { setError("Enter all 6–8 digits from your latest email."); return; }

    const fullPhone = `${phonePrefix}${phoneNum.replace(/\D/g, "").replace(/^0+/, "")}`;

    setLoading(true);
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
          phone_number: fullPhone,
          account_type: "customer",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.detail === "string" ? data.detail : "Could not verify your details.";
        if (/password|uppercase|UTF-8/i.test(msg)) setStep("details");
        setError(msg);
        return;
      }

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user_id", data.user_id);
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("userName", data.name);
      sessionStorage.removeItem("registerData");

      router.push("/");
    } catch (err: any) {
      setError(err.message || "An error occurred.");
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
        body: JSON.stringify({ email, purpose: "register" }),
      });
      if (res.ok) alert("Code resent to your email!");
      else setError("Failed to resend code.");
    } catch {
      setError("Error resending code.");
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
            {step === "verification"
              ? `Enter the verification code sent to ${email}`
              : "Sign up to start ordering from campus merchants."}
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        {step === "details" && (
          <form onSubmit={handleSendCode} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required value={name}
                onChange={(e) => setName(e.target.value)} placeholder="John Doe"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            {/* Phone Number with country code */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="flex rounded-xl border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-orange-500 overflow-hidden">
                <select
                  value={phonePrefix}
                  onChange={(e) => setPhonePrefix(e.target.value)}
                  className="bg-gray-100 border-r border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 focus:outline-none cursor-pointer w-28 truncate"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code + c.name} value={c.code}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="tel" required value={phoneNum}
                  onChange={(e) => setPhoneNum(e.target.value.replace(/\D/g, ""))}
                  placeholder="12345678"
                  className="w-full px-3 py-2 bg-transparent focus:outline-none text-sm text-gray-900"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                id="register-password" label="Password" minLength={12}
                autoComplete="new-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                At least 12 characters with uppercase, lowercase, a number and a symbol.
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                id="confirm-password" label="Confirm password"
                autoComplete="new-password" required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Enter your password again"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            {/* Terms and Conditions */}
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-orange-600 cursor-pointer"
              />
              <label htmlFor="terms" className="text-xs text-gray-600 cursor-pointer leading-relaxed">
                I agree to the{" "}
                <Link href="/terms" className="text-orange-600 font-semibold hover:underline">
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-orange-600 font-semibold hover:underline">
                  Privacy Policy
                </Link>
                .
              </label>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Sending Code..." : "Send Verification Code"}
            </button>

            <div className="text-center pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Already have an account?{" "}
                <Link href="/login" className="text-orange-600 font-semibold hover:underline">Log in</Link>
              </p>
            </div>
          </form>
        )}

        {step === "verification" && (
          <form onSubmit={handleVerifyAndRegister} className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-center">
              <p className="text-green-700 text-xs font-medium">✅ Code sent to {email}</p>
            </div>

            <div>
              <label htmlFor="verification-code" className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Verification Code (6–8 digits)
              </label>
              <input
                type="text" id="verification-code"
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}"
                required
                onPaste={(e) => {
                  e.preventDefault();
                  setVerificationCode(e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8));
                }}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Enter email code"
                className="w-full px-4 py-3 text-center text-2xl font-bold tracking-widest border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter every digit from the latest email. Code expires in 10 minutes.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || verificationCode.length < 6}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Verify & Create Account"}
            </button>

            <button
              type="button" onClick={handleResend} disabled={resending}
              className="w-full text-orange-600 hover:text-orange-700 font-semibold text-sm py-2 disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend Code"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("details"); setVerificationCode(""); setError(""); }}
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
