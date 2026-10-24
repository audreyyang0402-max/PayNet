// src/app/admin/rentals/page.tsx
"use client";

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

export default function AdminRentalsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<RentalBooking[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      const token = localStorage.getItem("token");

      if (!token) {
        router.push("/admin/login" as any);
        return;
      }

      const res = await fetch("http://127.0.0.1:8000/admin/boulevard/bookings", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to load bookings.");
      }

      const data = await res.json();
      setBookings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [router]);

  const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
    setSuccessMessage(null);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://127.0.0.1:8000/boulevard/bookings/${bookingId}/status`, {
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
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredBookings = filterStatus === "all" 
    ? bookings 
    : bookings.filter(b => b.status === filterStatus);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading admin rentals...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Admin Header & Navigation Tabs */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex justify-between items-center">
            <Link href="/vendor/dashboard" className="text-orange-600 hover:underline font-medium text-sm">
              ← Back to Dashboard
            </Link>
            {/* Admin Switcher Tabs */}
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Admin Rental Management</h1>
            <p className="text-gray-500 text-sm">Review and manage temporary Boulevard pop-up stall applications.</p>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
        {successMessage && <div className="p-4 bg-green-50 text-green-700 text-sm rounded-xl">{successMessage}</div>}

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900">Boulevard Pop-up Applications</h2>
            
            {/* Status Filter Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              {["all", "pending", "approved", "rejected"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                    filterStatus === status 
                      ? "bg-white text-gray-900 shadow-sm" 
                      : "text-gray-500 hover:text-gray-900"
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

      </div>
    </main>
  );
}