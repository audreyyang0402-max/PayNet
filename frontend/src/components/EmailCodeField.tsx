// src/components/EmailCodeField.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";

interface EmailCodeFieldProps {
  email: string;
  purpose: "register" | "reset";
  code: string;
  onCodeChange: (code: string) => void;
  accent?: "blue" | "orange";
}

// Full class names are written out so Tailwind can see them.
const ACCENTS = {
  blue: {
    button: "bg-blue-600 hover:bg-blue-700",
    input: "focus:ring-blue-600",
  },
  orange: {
    button: "bg-orange-600 hover:bg-orange-700",
    input: "focus:ring-orange-500",
  },
};

export default function EmailCodeField({
  email,
  purpose,
  code,
  onCodeChange,
  accent = "orange",
}: EmailCodeFieldProps) {
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const colors = ACCENTS[accent];

  // Count the resend cooldown down once per second
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    setError("");
    setInfo("");
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not send the code.");
      }
      setInfo(`Check your inbox (and spam folder). The code expires in 10 minutes.`);
      setCooldown(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email Verification Code</label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
          placeholder="6-digit code"
          className={`flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 tracking-widest focus:ring-2 ${colors.input} outline-none`}
        />
        <button
          type="button"
          onClick={sendCode}
          disabled={sending || cooldown > 0}
          className={`px-3.5 py-2 text-xs font-semibold text-white rounded-xl transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${colors.button}`}
        >
          {sending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Send Code"}
        </button>
      </div>
      {info && <p className="text-xs text-green-700 mt-1">{info}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
