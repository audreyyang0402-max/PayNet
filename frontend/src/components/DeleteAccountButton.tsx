// frontend/src/components/DeleteAccountButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAccountButton() {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch("http://127.0.0.1:8000/users/me/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Failed to delete account");
        return;
      }

      // Clear token and redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("user_id");
      router.push("/login");
      alert("Account deleted successfully. You have been logged out.");
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-3 rounded-lg transition-all border border-red-200"
        >
          🗑️ Delete My Account
        </button>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-bold text-red-800 mb-2">⚠️ Delete Account?</h3>
            <p className="text-sm text-red-700 mb-4">
              Your account will be deleted, but your order history will be preserved for records. This action cannot be undone.
            </p>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Enter Your Password to Confirm
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-red-300 rounded-lg focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConfirm(false);
                setPassword("");
                setError("");
              }}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading || !password}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
