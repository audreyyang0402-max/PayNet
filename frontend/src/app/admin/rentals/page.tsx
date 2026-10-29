// src/app/admin/rentals/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface RentalBooking {
  id: string;
  vendor_user_id: string;
  merchant_id: string;
  stall_id: string;
  start_date: string;
  end_date: string;
  status: string;
  deposit_paid: boolean;
  created_at: string;
  vendor_name: string;
  vendor_email: string;
  stall_name: string;
}

interface Stall {
  id: string;
  stall_number: string;
  location: string;
  size: string;
  rental_rate: number;
  is_available: boolean;
}

export default function AdminRentalsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"rentals" | "stalls">("rentals");
  const [bookings, setBookings] = useState<RentalBooking[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states for creating a new stall
  const [stallNumber, setStallNumber] = useState("");
  const [stallLocation, setStallLocation] = useState("");
  const [stallSize, setStallSize] = useState("");
  const [rentalRate, setRentalRate] = useState("");
  const [stallSuccess, setStallSuccess] = useState<string | null>(null);

  // Edit Stall Modal State
  const [editingStall, setEditingStall] = useState<Stall | null>(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");

      if (!token) {
        router.push("/admin/login" as any);
        return;
      }

      const [bookingsRes, stallsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/admin/boulevard/bookings`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BACKEND_URL}/boulevard/stalls`)
      ]);

      if (!bookingsRes.ok) {
        const errData = await bookingsRes.json();
        throw new Error(errData.detail || "Failed to load bookings.");
      }

      const bookingsData = await bookingsRes.json();
      setBookings(bookingsData);

      if (stallsRes.ok) {
        const stallsData = await stallsRes.json();
        setStalls(stallsData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
    setSuccessMessage(null);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/boulevard/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update status.");
      }

      setSuccessMessage(`Booking successfully marked as ${newStatus}!`);
      setBookings(bookings.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateStall = async (e: React.FormEvent) => {
    e.preventDefault();
    setStallSuccess(null);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/boulevard/stalls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stall_number: stallNumber,
          location: stallLocation,
          size: stallSize,
          rental_rate: parseFloat(rentalRate),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create stall.");
      }

      const newStall = await res.json();
      setStalls([newStall, ...stalls]);
      setStallSuccess("Stall created successfully and published!");
      setStallNumber("");
      setStallLocation("");
      setStallSize("");
      setRentalRate("");
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteStall = async (stallId: string) => {
    if (!confirm("Are you sure you want to delete this stall?")) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/boulevard/stalls/${stallId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to delete stall.");

      setStalls(stalls.filter(s => s.id !== stallId));
      setSuccessMessage("Stall deleted successfully.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleAvailability = async (stallId: string) => {
    setError(null);
    setSuccessMessage(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/boulevard/stalls/${stallId}/toggle-availability`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to update availability.");

      const updatedStall = await res.json();
      setStalls(stalls.map(s => s.id === stallId ? updatedStall : s));
      setSuccessMessage(`Stall #${updatedStall.stall_number} availability updated successfully!`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateStall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStall) return;
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/boulevard/stalls/${editingStall.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stall_number: editingStall.stall_number,
          location: editingStall.location,
          size: editingStall.size,
          rental_rate: Number(editingStall.rental_rate),
        }),
      });

      if (!res.ok) throw new Error("Failed to update stall.");

      const updated = await res.json();
      setStalls(stalls.map(s => s.id === updated.id ? updated : s));
      setSuccessMessage("Stall updated successfully!");
      setEditingStall(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredBookings = filterStatus === "all" 
    ? bookings 
    : bookings.filter(b => b.status === filterStatus);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading admin panel...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Admin Header & Navigation Tabs */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex justify-between items-center">
            <Link href="/vendor/dashboard" className="text-orange-600 hover:underline font-medium text-sm">
              ← Back to Dashboard
            </Link>
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <Link href="/admin/rentals" className="px-4 py-2 bg-white text-gray-900 rounded-lg shadow-sm">
                Rental Management
              </Link>
              <Link href="/admin/analytics" className="px-4 py-2 text-gray-500 hover:text-gray-900 rounded-lg transition-all">
                Analytics
              </Link>
              <Link href="/admin/users" className="px-4 py-2 text-gray-500 hover:text-gray-900 rounded-lg transition-all">
                User Directory
              </Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mt-2">Admin Rental Management</h1>
              <p className="text-gray-500 text-sm">Review pop-up applications and manage physical campus Boulevard stalls.</p>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setActiveTab("rentals")}
                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === "rentals" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Applications ({bookings.length})
              </button>
              <button
                onClick={() => setActiveTab("stalls")}
                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === "stalls" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Manage Stalls ({stalls.length})
              </button>
            </div>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
        {successMessage && <div className="p-4 bg-green-50 text-green-700 text-sm rounded-xl">{successMessage}</div>}

        {activeTab === "rentals" ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-lg font-bold text-gray-900">Boulevard Pop-up Applications</h2>
              
              <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                {["all", "pending", "approved", "rejected"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                      filterStatus === status ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            
            {filteredBookings.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No {filterStatus !== "all" ? filterStatus : ""} rental applications found.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((booking) => (
                  <div key={booking.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">{booking.stall_name}</h3>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-medium px-2 py-0.5 rounded">
                          Pop-up Vendor
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-700">
                        Vendor: <span className="text-gray-900 font-semibold">{booking.vendor_name}</span> ({booking.vendor_email})
                      </p>
                      <p className="text-xs text-gray-500 font-medium">
                        📅 {booking.start_date} to {booking.end_date}
                      </p>
                      <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase mt-1 ${
                        booking.status === 'approved' ? 'bg-green-100 text-green-800' :
                        booking.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {booking.status}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(booking.id, "approved")}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(booking.id, "rejected")}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Create New Stall Form */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Create New Boulevard Stall</h2>
              {stallSuccess && <div className="p-3 bg-green-50 text-green-700 text-xs rounded-xl">{stallSuccess}</div>}
              
              <form onSubmit={handleCreateStall} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Stall Number / Name</label>
                  <input
                    type="text"
                    required
                    value={stallNumber}
                    onChange={(e) => setStallNumber(e.target.value)}
                    placeholder="A2"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Location on Campus</label>
                  <input
                    type="text"
                    required
                    value={stallLocation}
                    onChange={(e) => setStallLocation(e.target.value)}
                    placeholder="Zone A - Main Boulevard"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Size</label>
                  <input
                    type="text"
                    required
                    value={stallSize}
                    onChange={(e) => setStallSize(e.target.value)}
                    placeholder="3x3m"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Monthly Rental Rate (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={rentalRate}
                    onChange={(e) => setRentalRate(e.target.value)}
                    placeholder="350.00"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm cursor-pointer"
                >
                  Publish Stall
                </button>
              </form>
            </div>

            {/* Active Stalls List with Manual Availability Toggle Button */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Active Campus Stalls ({stalls.length})</h2>
              {stalls.length === 0 ? (
                <p className="text-gray-500 text-sm py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  No physical stalls created yet. Use the form to publish one.
                </p>
              ) : (
                <div className="space-y-3">
                  {stalls.map((stall) => (
                    <div key={stall.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 text-sm">Stall #{stall.stall_number}</h3>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              stall.is_available 
                                ? "bg-green-100 text-green-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {stall.is_available ? "Available Active" : "Unavailable (Closed)"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">📍 {stall.location} | 📏 {stall.size}</p>
                        </div>
                        <span className="text-orange-600 font-bold text-sm">RM {Number(stall.rental_rate).toFixed(2)} / mo</span>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                        {/* Manual Toggle Button */}
                        <button
                          onClick={() => handleToggleAvailability(stall.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            stall.is_available 
                              ? "bg-amber-600 hover:bg-amber-700 text-white" 
                              : "bg-green-600 hover:bg-green-700 text-white"
                          }`}
                        >
                          {stall.is_available ? "Set Unavailable" : "Set Available"}
                        </button>
                        <button
                          onClick={() => setEditingStall(stall)}
                          className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteStall(stall.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Edit Stall Modal */}
      {editingStall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Edit Stall #{editingStall.stall_number}</h3>
            
            <form onSubmit={handleUpdateStall} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Stall Number / Name</label>
                <input
                  type="text"
                  required
                  value={editingStall.stall_number}
                  onChange={(e) => setEditingStall({ ...editingStall, stall_number: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Location on Campus</label>
                <input
                  type="text"
                  required
                  value={editingStall.location}
                  onChange={(e) => setEditingStall({ ...editingStall, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Size</label>
                <input
                  type="text"
                  required
                  value={editingStall.size}
                  onChange={(e) => setEditingStall({ ...editingStall, size: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Monthly Rental Rate (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingStall.rental_rate}
                  onChange={(e) => setEditingStall({ ...editingStall, rental_rate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-all cursor-pointer"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStall(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2.5 rounded-xl text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}