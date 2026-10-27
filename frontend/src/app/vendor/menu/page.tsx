// src/app/vendor/menu/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MerchantProfile {
  id: string;
  name: string;
  location: string;
  description: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  image_url?: string;
}

interface PickupSlotProfile {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

export default function MerchantMenuPage() {
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [slots, setSlots] = useState<PickupSlotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state for adding a new item
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    price: "",
    image_url: "",
  });

  // Form state for creating a pickup slot
  const [newSlot, setNewSlot] = useState({
    time_slot: "",
    max_capacity: "10",
  });

  useEffect(() => {
    async function loadMenuData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");

        if (!token || role !== "merchant") {
          router.push("/vendor/login" as any);
          return;
        }

        const profileRes = await fetch("http://127.0.0.1:8000/merchants/me/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!profileRes.ok) throw new Error("Could not load merchant profile.");
        const profileData = await profileRes.json();
        setMerchant(profileData);

        // Fetch menu items
        const menuRes = await fetch(`http://127.0.0.1:8000/merchants/${profileData.id}/items`);
        if (menuRes.ok) {
          const menuData = await menuRes.json();
          setMenuItems(menuData);
        }

        // Fetch pickup slots
        const slotsRes = await fetch(`http://127.0.0.1:8000/merchants/${profileData.id}/pickup-slots`);
        if (slotsRes.ok) {
          const slotsData = await slotsRes.json();
          setSlots(slotsData);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadMenuData();
  }, [router]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/merchants/${merchant.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItem.name,
          description: newItem.description,
          price: parseFloat(newItem.price),
          is_available: true,
          image_url: newItem.image_url || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to add item.");

      const addedItem = await res.json();
      setMenuItems([...menuItems, addedItem]);
      setNewItem({ name: "", description: "", price: "", image_url: "" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/merchants/${merchant.id}/pickup-slots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          time_slot: newSlot.time_slot,
          max_capacity: parseInt(newSlot.max_capacity, 10),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create pickup slot.");
      }

      const createdSlot = await res.json();
      setSlots([...slots, createdSlot]);
      alert("Pickup slot created successfully!");
      setNewSlot({ time_slot: "", max_capacity: "10" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Are you sure you want to delete this pickup slot?")) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/merchants/pickup-slots/${slotId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete pickup slot.");

      setSlots(slots.filter((s) => s.id !== slotId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/merchants/items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete item.");

      setMenuItems(menuItems.filter((i) => i.id !== itemId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/merchants/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          is_available: !item.is_available,
        }),
      });

      if (!res.ok) throw new Error("Failed to update status.");

      const updated = await res.json();
      setMenuItems(menuItems.map((i) => (i.id === item.id ? updated : i)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/vendor/login" as any);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading menu manager...</div>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 text-center m-8 rounded-xl">{error}</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
          <div>
            <Link href="/vendor/dashboard" className="text-orange-600 hover:underline font-medium text-sm inline-block mb-1">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Manage Menu & Pickup Slots</h1>
            <p className="text-gray-500 text-sm">{merchant?.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white border border-gray-200 hover:border-red-300 text-gray-600 hover:text-red-600 text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Log Out
          </button>
        </div>

        {/* Forms Grid: Add Menu Item & Create Pickup Slot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Add New Item Form */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add Menu Item</h2>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                  placeholder="e.g. Nasi Lemak"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description</label>
                <textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                  placeholder="Spicy and delicious..."
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Price (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newItem.price}
                  onChange={(e) => setNewItem({...newItem, price: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                  placeholder="10.50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Image URL</label>
                <input
                  type="url"
                  value={newItem.image_url}
                  onChange={(e) => setNewItem({...newItem, image_url: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm cursor-pointer"
              >
                + Add to Menu
              </button>
            </form>
          </div>

          {/* Create Pickup Slot Form */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Create Pickup Slot</h2>
            <form onSubmit={handleCreateSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Time Slot Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={newSlot.time_slot}
                  onChange={(e) => setNewSlot({...newSlot, time_slot: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Max Capacity (Orders)</label>
                <input
                  type="number"
                  required
                  value={newSlot.max_capacity}
                  onChange={(e) => setNewSlot({...newSlot, max_capacity: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm text-gray-900"
                  placeholder="10"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl transition-all text-sm cursor-pointer mt-7"
              >
                + Generate Pickup Slot
              </button>
            </form>
          </div>

        </div>

        {/* Current Menu Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Current Menu</h2>
          {menuItems.length === 0 ? (
            <p className="text-gray-500 p-6 rounded-2xl border border-gray-200 text-center text-sm">
              Your menu is empty. Add some items above!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {menuItems.map((item) => (
                <div key={item.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col justify-between">
                  <div>
                    {item.image_url && (
                      <div className="w-full h-28 mb-3 rounded-lg overflow-hidden bg-gray-100 relative">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-gray-900 text-sm">{item.name}</h3>
                      <span className="font-semibold text-orange-600 text-sm">RM {Number(item.price).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                    <button
                      onClick={() => handleToggleAvailability(item)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        item.is_available ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {item.is_available ? 'Available' : 'Sold Out'}
                    </button>

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-gray-400 hover:text-red-600 text-xs font-medium cursor-pointer transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Pickup Slots Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Manage Pickup Slots</h2>
          {slots.length === 0 ? (
            <p className="text-gray-500 p-6 rounded-2xl border border-gray-200 text-center text-sm">
              No pickup slots created yet. Generate one above!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {slots.map((slot) => (
                <div key={slot.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">
                      {new Date(slot.time_slot).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Bookings: {slot.current_bookings} / {slot.max_capacity}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="text-gray-400 hover:text-red-600 text-xs font-medium cursor-pointer transition-colors px-2 py-1 bg-white border border-gray-200 rounded-lg"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}