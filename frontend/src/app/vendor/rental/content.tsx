// src/app/vendor/rental/content.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Stall {
  id: string;
  stall_number: string;
  location: string;
  size: string;
  rental_rate: number;
  is_available?: boolean;
  is_occupied?: boolean;
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

export default function RentalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const referenceId = searchParams.get("reference");

  const [stalls, setStalls] = useState<Stall[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for booking a stall
  const [selectedStallId, setSelectedStallId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState("");

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<Booking | null>(null);

  useEffect(() => {
    async function verifyAndLoadData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");

        // Allow both merchants and pop-up vendors (customers) to view and book rentals
        if (!token || (role !== "merchant" && role !== "customer")) {
          router.push("/vendor/login" as any);
          return;
        }

        // If redirected back from HitPay with success and a reference ID, update payment status on backend
        if (paymentStatus === "success" && referenceId) {
          await fetch(`http://127.0.0.1:8000/boulevard/bookings/${referenceId}/check-payment`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setPaymentSuccessMsg("Rental payment completed successfully via HitPay!");
        }

        // 1. Fetch all Boulevard stalls
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

    verifyAndLoadData();
  }, [router, paymentStatus, referenceId]);

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

  const handlePayRental = async (bookingId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://127.0.0.1:8000/boulevard/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to initiate payment.");
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // Redirects vendor directly to HitPay checkout
      } else {
        throw new Error("Invalid payment gateway response URL.");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Filter stalls for the booking dropdown (only available and not occupied)
  const availableStalls = stalls.filter(
    (stall) => stall.is_available !== false && !stall.is_occupied
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading rentals...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <Link href="/" className="text-orange-600 hover:underline font-medium text-sm">
              ← Back to Marketplace
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Boulevard Stall Rentals</h1>
            <p className="text-gray-500 text-sm">Browse campus boulevard spots and manage your rental requests.</p>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
        {bookingSuccess && <div className="p-4 bg-green-50 text-green-700 text-sm rounded-xl">{bookingSuccess}</div>}
        {paymentSuccessMsg && <div className="p-4 bg-green-50 text-green-700 text-sm rounded-xl">{paymentSuccessMsg}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* All Stalls Status List */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Campus Stalls Overview</h2>
            {stalls.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">No stalls available at the moment.</p>
            ) : (
              <div className="space-y-3">
                {stalls.map((stall) => (
                  <div key={stall.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900 text-sm">Stall #{stall.stall_number}</h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            stall.is_occupied 
                              ? "bg-red-100 text-red-800" 
                              : stall.is_available === false 
                              ? "bg-amber-100 text-amber-800" 
                              : "bg-green-100 text-green-800"
                          }`}>
                            {stall.is_occupied 
                              ? "Occupied (Rented)" 
                              : stall.is_available === false 
                              ? "Unavailable" 
                              : "Available"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">📍 Location: {stall.location}</p>
                        {stall.size && <p className="text-xs text-gray-500">📏 Size: {stall.size}</p>}
                      </div>
                      <span className="text-orange-600 font-semibold text-sm">RM {Number(stall.rental_rate).toFixed(2)} / mo</span>
                    </div>
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
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Select Available Stall</label>
                <select
                  required
                  value={selectedStallId}
                  onChange={(e) => setSelectedStallId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="">-- Choose an Available Stall --</option>
                  {availableStalls.map((stall) => (
                    <option key={stall.id} value={stall.id}>
                      Stall #{stall.stall_number} ({stall.location}) - RM {stall.rental_rate}/mo
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
                  
                  <div className="flex items-center space-x-3">
                    {booking.status === 'approved' && !booking.deposit_paid && (
                      <button
                        onClick={() => handlePayRental(booking.id)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
                      >
                        Pay Rental Fee
                      </button>
                    )}

                    {booking.deposit_paid && (
                      <button
                        onClick={() => setSelectedReceipt(booking)}
                        className="px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
                      >
                        View Receipt
                      </button>
                    )}

                    <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase ${
                      booking.status === 'approved' ? 'bg-green-100 text-green-800' :
                      booking.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="text-center pb-4 border-b border-gray-100">
              <span className="bg-green-50 text-green-600 text-xs font-bold px-3 py-1 rounded-full uppercase">
                Payment Successful
              </span>
              <h3 className="text-xl font-bold text-gray-900 mt-2">Sunway Boulevard Receipt</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedReceipt.id}</p>
            </div>

            <div className="space-y-2 text-sm text-gray-600 py-2">
              <div className="flex justify-between">
                <span className="font-semibold">Rental Period:</span>
                <span>{selectedReceipt.start_date} to {selectedReceipt.end_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Deposit Status:</span>
                <span className="text-green-600 font-bold">PAID ✓</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Gateway:</span>
                <span>HitPay Sandbox</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedReceipt(null)}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl text-sm transition-all cursor-pointer"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
