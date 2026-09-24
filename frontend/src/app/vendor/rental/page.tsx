// src/app/vendor/rentals/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Stall {
  id: string;
  stall_number: string;
  location: string;
  size: string;
  rental_rate: number;
}

interface Booking {
  id: string;
  stall_id: string;
  start_date: string;
  end_date: string;
  status: string;
  deposit_paid: boolean;
  created_at: string;
}

export default function VendorRentalsPage() {
  const router = useRouter();
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for booking a stall
  const [selectedStallId, setSelectedStallId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");

  useEffect(() => {
    async function loadRentalData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");

        if (!token || role !== "merchant") {
          router.push("/vendor/login" as any);
          return;
        }

        // 1. Fetch available Boulevard stalls
        const stallsRes = await fetch("http://127.0.0.1:8000/boulevard/stalls");
        if (stallsRes.ok) {
          const stallsData = await stallsRes.json();
          setStalls(stallsData);
        }

        // 2. Fetch vendor's existing bookings
        const bookingsRes = await fetch("http://127.0.0.1:8000/boulevard/my-bookings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          setMyBookings(bookingsData);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadRentalData();
  }, [router]);

  const handleBookStall = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingSuccess("");
    setError(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://127.0.0.1:8000/boulevard/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stall_id: selectedStallId,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to book stall.");
      }

      const newBooking = await res.json();
      setMyBookings([newBooking, ...myBookings]);
      setBookingSuccess("Rental booking request submitted successfully!");
      setSelectedStallId("");
      setStartDate("");
      setEndDate("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading rentals...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <Link href="/vendor/dashboard" className="text-orange-600 hover:underline font-medium text-sm">
              ← Back to Vendor Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Boulevard Stall Rentals</h1>
            <p className="text-gray-500 text-sm">Browse available boulevard spots and manage your rental requests.</p>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
        {bookingSuccess && <div className="p-4 bg-green-50 text-green-700 text-sm rounded-xl">{bookingSuccess}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Available Stalls Grid */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Available Stalls</h2>
            {stalls.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">No stalls available at the moment.</p>
            ) : (
              <div className="space-y-3">
                {stalls.map((stall) => (
                  <div key={stall.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-1">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-gray-900 text-sm">Stall #{stall.stall_number}</h3>
                      <span className="text-orange-600 font-semibold text-sm">RM {Number(stall.rental_rate).toFixed(2)} / mo</span>
                    </div>
                    <p className="text-xs text-gray-500">📍 Location: {stall.location}</p>
                    {stall.size && <p className="text-xs text-gray-500">📏 Size: {stall.size}</p> }
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Book a Stall Form */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Request Stall Rental</h2>
            <form onSubmit={handleBookStall} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Select Stall</label>
                <select
                  required
                  value={selectedStallId}
                  onChange={(e) => setSelectedStallId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="">-- Choose a Stall --</option>
                  {stalls.map((stall) => (
                    <option key={stall.id} value={stall.id}>
                      Stall #{stall.stall_number} ({stall.location}) - RM {stall.rental_rate}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">End Date</label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm cursor-pointer"
              >
                Submit Rental Booking
              </button>
            </form>
          </div>

        </div>

        {/* My Rental Bookings Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">My Rental Applications</h2>
          {myBookings.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              You haven't submitted any rental applications yet.
            </p>
          ) : (
            <div className="space-y-3">
              {myBookings.map((booking) => (
                <div key={booking.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 font-mono">Booking ID: {booking.id}</p>
                    <p className="text-sm font-medium text-gray-800">
                      📅 {booking.start_date} to {booking.end_date}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase ${
                    booking.status === 'approved' ? 'bg-green-100 text-green-800' :
                    booking.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}