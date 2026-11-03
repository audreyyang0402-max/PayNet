"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  role: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

type NewRole = "admin" | "merchant" | "customer";

interface RoleModalState {
  user: UserProfile;
  selectedRole: NewRole;
  storeName: string;
  location: string;
  description: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  merchant: "bg-orange-100 text-orange-800",
  customer: "bg-blue-100 text-blue-800",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Role-edit modal
  const [modal, setModal] = useState<RoleModalState | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) { router.push("/admin/login" as any); return; }

      const res = await fetch(`${BACKEND_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to load users.");
      }
      setUsers(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [router]);

  // ── Delete user ──────────────────────────────────────────────────────────
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to delete user");
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ── Open the role-edit modal ─────────────────────────────────────────────
  const openRoleModal = (user: UserProfile) => {
    setModal({
      user,
      selectedRole: user.role as NewRole,
      storeName: "",
      location: "",
      description: "",
    });
    setModalError(null);
  };

  // ── Submit role change ───────────────────────────────────────────────────
  const handleRoleSubmit = async () => {
    if (!modal) return;
    if (modal.selectedRole === modal.user.role) { setModal(null); return; }
    if (modal.selectedRole === "merchant" && !modal.storeName.trim()) {
      setModalError("Store name is required when promoting to merchant.");
      return;
    }

    setModalLoading(true);
    setModalError(null);
    try {
      const token = localStorage.getItem("token");
      const body: Record<string, string> = { role: modal.selectedRole };
      if (modal.selectedRole === "merchant") {
        body.store_name = modal.storeName.trim();
        if (modal.location.trim()) body.location = modal.location.trim();
        if (modal.description.trim()) body.description = modal.description.trim();
      }
      const res = await fetch(`${BACKEND_URL}/admin/users/${modal.user.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to update role");
      setModal(null);
      await fetchUsers();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  // ── Filtered + searched list ─────────────────────────────────────────────
  // Deleted accounts only ever show under the "Deleted" tab — every other tab excludes them.
  const filteredUsers = users.filter((u) => {
    const matchRole =
      filterRole === "deleted" ? !!u.is_deleted :
      !u.is_deleted && (filterRole === "all" || u.role === filterRole);
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading users…
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Users in the System</h1>
          <p className="text-gray-500 text-sm mt-1">
            All accounts are registered as <span className="font-semibold">Customer</span> by default.
            Admins assign the <span className="font-semibold">Merchant</span> or{" "}
            <span className="font-semibold">Admin</span> role here after reviewing each request.
          </p>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}

        {/* ── User Directory Card ── */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900">
              Registered Accounts ({filteredUsers.length}/{users.length})
            </h2>

            {/* Search */}
            <input
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-1.5 text-sm w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Role Filter Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold w-fit">
            {["all", "customer", "merchant", "admin", "deleted"].map((role) => (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  filterRole === role
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              No accounts found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 font-medium text-xs uppercase tracking-wide">
                    <th className="pb-3 px-4">Name</th>
                    <th className="pb-3 px-4">Email</th>
                    <th className="pb-3 px-4">Phone</th>
                    <th className="pb-3 px-4">Role</th>
                    <th className="pb-3 px-4">Joined</th>
                    <th className="pb-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-semibold text-gray-900">{u.name}</td>
                      <td className="py-3 px-4 text-gray-600">{u.email}</td>
                      <td className="py-3 px-4 text-gray-500">{u.phone_number || "—"}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase ${
                            ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                        {u.is_deleted && u.deleted_at && (
                          <div className="text-red-400 mt-0.5">Deleted {new Date(u.deleted_at).toLocaleDateString()}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {u.is_deleted ? (
                          <span className="text-xs text-gray-400 italic">Account deleted</span>
                        ) : (
                          <>
                            <button
                              onClick={() => openRoleModal(u)}
                              className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-semibold rounded-lg transition"
                            >
                              Assign Role
                            </button>
                            {u.role !== "admin" && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.name)}
                                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg transition"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Role Assignment Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Assign Role</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Updating <span className="font-semibold">{modal.user.name}</span> (
                {modal.user.email})
              </p>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {modalError}
              </div>
            )}

            {/* Role selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">
                New Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["customer", "merchant", "admin"] as NewRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setModal((m) => m ? { ...m, selectedRole: r } : m)}
                    className={`py-2.5 rounded-xl text-sm font-semibold capitalize transition-all cursor-pointer ${
                      modal.selectedRole === r
                        ? "bg-orange-600 text-white shadow-md"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {r === "customer" ? "🎓 Customer" : r === "merchant" ? "🏪 Merchant" : "🛡 Admin"}
                  </button>
                ))}
              </div>
            </div>

            {/* Merchant-specific fields */}
            {modal.selectedRole === "merchant" && (
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  A merchant profile will be created or updated for this user.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Store / Stall Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={modal.storeName}
                    onChange={(e) => setModal((m) => m ? { ...m, storeName: e.target.value } : m)}
                    placeholder="e.g. Kai Fan Shop"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Campus Location
                  </label>
                  <input
                    type="text"
                    value={modal.location}
                    onChange={(e) => setModal((m) => m ? { ...m, location: e.target.value } : m)}
                    placeholder="e.g. Fresco"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={modal.description}
                    onChange={(e) => setModal((m) => m ? { ...m, description: e.target.value } : m)}
                    placeholder="Short description of the stall"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Caution for admin promotion */}
            {modal.selectedRole === "admin" && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-xl">
                ⚠️ Granting <strong>Admin</strong> gives full platform access. Only do this for trusted staff.
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setModal(null)}
                disabled={modalLoading}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleSubmit}
                disabled={modalLoading || modal.selectedRole === modal.user.role}
                className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-50 transition"
              >
                {modalLoading
                  ? "Saving…"
                  : modal.selectedRole === modal.user.role
                  ? "No Change"
                  : `Set as ${modal.selectedRole}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
