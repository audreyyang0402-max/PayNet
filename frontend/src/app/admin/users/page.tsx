"use client";

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
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/admin/login" as any);
        return;
      }

      const res = await fetch("http://127.0.0.1:8000/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to load users.");
      }

      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [router]);

  const filteredUsers = filterRole === "all" 
    ? users 
    : users.filter(u => u.role === filterRole);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading users directory...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <Link href="/admin/rentals" className="text-orange-600 hover:underline font-medium text-sm">
              ← Back to Rental Management
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Platform User Management</h1>
            <p className="text-gray-500 text-sm">Overview of all registered customers, campus merchants, and temporary pop-up vendors.</p>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}

        {/* User Directory Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900">Registered Accounts ({users.length})</h2>
            
            {/* Role Filter Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              {["all", "merchant", "customer", "admin"].map((role) => (
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
          </div>
          
          {filteredUsers.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              No users found with role: {filterRole}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 font-medium">
                    <th className="pb-3 px-4">Name</th>
                    <th className="pb-3 px-4">Email</th>
                    <th className="pb-3 px-4">Phone</th>
                    <th className="pb-3 px-4">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-semibold text-gray-900">{u.name}</td>
                      <td className="py-3 px-4 text-gray-600">{u.email}</td>
                      <td className="py-3 px-4 text-gray-500">{u.phone_number}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          u.role === 'merchant' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}