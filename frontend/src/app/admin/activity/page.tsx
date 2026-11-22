"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AuditEntry {
  id: string;
  created_at: string;
  actor_name: string;
  actor_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  details: Record<string, unknown> | null;
}

const TARGET_TYPES = ["all", "merchant", "menu_item", "user", "event", "pickup_slot", "refund"];

const TARGET_COLORS: Record<string, string> = {
  merchant: "bg-orange-100 text-orange-800",
  menu_item: "bg-amber-100 text-amber-800",
  user: "bg-blue-100 text-blue-800",
  event: "bg-pink-100 text-pink-800",
  pickup_slot: "bg-teal-100 text-teal-800",
  refund: "bg-purple-100 text-purple-800",
};

const PAGE_SIZE = 50;

export default function AdminActivityPage() {
  const router = useRouter();

  // null = still checking access; false = not allowed (render nothing, blend in); true = allowed
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [actorEmail, setActorEmail] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (nextOffset: number, replace: boolean) => {
      const token = localStorage.getItem("token");
      if (!token) { router.push("/admin/login" as any); return; }

      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      if (targetType !== "all") params.set("target_type", targetType);
      if (actorEmail !== "all") params.set("actor_email", actorEmail);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`${BACKEND_URL}/admin/audit-log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // A non-founder admin who somehow lands here sees a plain "not found" --
      // the same thing they'd see for any route that doesn't exist.
      if (res.status === 404) { setAllowed(false); return; }
      if (!res.ok) throw new Error("Failed to load the activity log.");

      const data = await res.json();
      setAllowed(true);
      setTotal(data.total);
      setOffset(nextOffset + data.entries.length);
      setEntries((prev) => (replace ? data.entries : [...prev, ...data.entries]));
    },
    [router, targetType, actorEmail, search]
  );

  // Initial load + reload whenever a filter changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPage(0, true)
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, actorEmail]);

  // Debounce free-text search
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchPage(0, true)
        .catch((err: any) => setError(err.message))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchPage(offset, false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const knownActors = Array.from(new Set(entries.map((e) => e.actor_email))).sort();

  // Access not yet confirmed, or confirmed false: render nothing distinctive.
  // No "access denied" message -- that would itself confirm the page is real.
  if (allowed === null) return <div className="min-h-screen bg-gray-50" />;
  if (allowed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        404 — this page could not be found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-gray-500 text-sm mt-1">
            Every change made in the admin portal — who did it, when, and exactly what changed.
            This page is only visible to the two of you.
          </p>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}

        {/* Log card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900">
              {total} recorded {total === 1 ? "change" : "changes"}
            </h2>
            <input
              type="search"
              placeholder="Search what changed…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold w-fit">
              {TARGET_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                    targetType === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {t.replace("_", " ")}
                </button>
              ))}
            </div>

            <select
              value={actorEmail}
              onChange={(e) => setActorEmail(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">Everyone</option>
              {knownActors.map((email) => (
                <option key={email} value={email}>{email}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm py-8 text-center">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              No changes recorded yet.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 font-medium text-xs uppercase tracking-wide">
                      <th className="pb-3 px-4">When</th>
                      <th className="pb-3 px-4">Who</th>
                      <th className="pb-3 px-4">Target</th>
                      <th className="pb-3 px-4">What changed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((e) => (
                      <tr
                        key={e.id}
                        className="hover:bg-gray-50/50 cursor-pointer align-top"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      >
                        <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900">{e.actor_name}</div>
                          <div className="text-gray-400 text-xs">{e.actor_email}</div>
                        </td>
                        <td className="py-3 px-4">
                          {e.target_type && (
                            <span
                              className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                                TARGET_COLORS[e.target_type] ?? "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {e.target_type.replace("_", " ")}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-700">
                          {e.summary}
                          {e.details != null && expanded === e.id && (
                            <pre className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 overflow-x-auto">
                              {JSON.stringify(e.details, null, 2)}
                            </pre>
                          )}
                          {e.details != null && (
                            <div className="text-xs text-orange-600 font-semibold mt-1">
                              {expanded === e.id ? "Hide details" : "Show details"}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {offset < total && (
                <div className="text-center pt-2">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : `Load more (${total - offset} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
