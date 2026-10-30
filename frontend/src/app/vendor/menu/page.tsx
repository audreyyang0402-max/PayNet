// src/app/vendor/menu/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Vendor Menu & Pickup Slot Manager
//
// Features:
//  • Complete Food Product Information (Name, Category, Description, Price,
//    Spiciness Level, Size Variations, Add-ons, Dietary & Allergen info, Prep Time).
//  • Food Photo Requirements (JPG/JPEG/PNG file upload, instant image preview,
//    URL option, replace/remove photos).
//  • Instant availability toggle (Available / Sold Out).
//  • Pickup slot generator and management.
//  • Mobile-friendly, compact responsive layout with warm brand colours.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Interfaces ──────────────────────────────────────────────────────────────

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
  image_url?: string | null;
}

interface PickupSlotProfile {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

// ─── Constants for Categories, Variations & Tags ─────────────────────────────

const FOOD_CATEGORIES = [
  "Main Course",
  "Noodles & Rice",
  "Snacks & Finger Food",
  "Desserts",
  "Beverages",
  "Set Meals / Combos",
  "Side Dishes",
];

const SPICE_LEVELS = [
  { label: "Non-Spicy", emoji: "🌱" },
  { label: "Mild Spicy", emoji: "🌶️" },
  { label: "Medium Spicy", emoji: "🌶️🌶️" },
  { label: "Extra Spicy", emoji: "🔥🌶️" },
];

const DIETARY_OPTIONS = [
  "Halal",
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Pork-Free",
];

const ALLERGEN_OPTIONS = [
  "Peanuts",
  "Dairy",
  "Eggs",
  "Seafood / Shellfish",
  "Soy",
  "Gluten / Wheat",
];

const PREP_TIMES = ["3-5 mins", "5-10 mins", "10-15 mins", "15-20 mins"];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MerchantMenuPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Merchant & Menu States ──
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [slots, setSlots] = useState<PickupSlotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Form State: Food Product Information ──
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Main Course");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [spiceLevel, setSpiceLevel] = useState("Non-Spicy");
  const [sizeVariation, setSizeVariation] = useState("Regular");
  const [addons, setAddons] = useState("");
  const [selectedDietary, setSelectedDietary] = useState<string[]>(["Halal"]);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [prepTime, setPrepTime] = useState("5-10 mins");

  // ── Form State: Food Photo & Preview ──
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // ── Form State: Pickup Slot ──
  const [newSlot, setNewSlot] = useState({
    time_slot: "",
    max_capacity: "10",
  });

  // ─── Load Merchant Data on Mount ───────────────────────────────────────────
  useEffect(() => {
    async function loadMenuData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");

        if (!token || role !== "merchant") {
          router.push("/vendor/login" as any);
          return;
        }

        const profileRes = await fetch(`${BACKEND_URL}/merchants/me/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!profileRes.ok) throw new Error("Could not load merchant profile.");
        const profileData = await profileRes.json();
        setMerchant(profileData);

        // Fetch menu items
        const menuRes = await fetch(`${BACKEND_URL}/merchants/${profileData.id}/items`);
        if (menuRes.ok) {
          const menuData = await menuRes.json();
          setMenuItems(menuData);
        }

        // Fetch pickup slots
        const slotsRes = await fetch(`${BACKEND_URL}/merchants/${profileData.id}/pickup-slots`);
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

  // ─── Photo Upload & Preview Handler (JPG, JPEG, PNG) ──────────────────────
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      alert("Please upload a valid JPG, JPEG, or PNG image file.");
      return;
    }

    // Read as Data URL for instant preview & storage
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleClearPhoto = () => {
    setImagePreview(null);
    setImageUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Add Menu Item Handler ────────────────────────────────────────────────
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    try {
      // Build structured tag metadata into description
      const tags: string[] = [];
      if (category) tags.push(`Category: ${category}`);
      if (spiceLevel) tags.push(`Spiciness: ${spiceLevel}`);
      if (prepTime) tags.push(`Prep: ${prepTime}`);
      if (selectedDietary.length > 0) tags.push(`Dietary: ${selectedDietary.join(", ")}`);
      if (selectedAllergens.length > 0) tags.push(`Allergens: ${selectedAllergens.join(", ")}`);
      if (addons.trim()) tags.push(`Add-ons: ${addons.trim()}`);
      if (sizeVariation) tags.push(`Size: ${sizeVariation}`);

      const compiledDescription = tags.length > 0
        ? `${description.trim()}\n[${tags.join(" | ")}]`
        : description.trim();

      const res = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: compiledDescription,
          price: parseFloat(price),
          is_available: true,
          image_url: imageUrl.trim() || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to add menu item.");

      const addedItem = await res.json();
      setMenuItems([...menuItems, addedItem]);

      // Reset form
      setName("");
      setDescription("");
      setPrice("");
      setAddons("");
      handleClearPhoto();
      alert("Food product added to your stall menu successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to add food product.");
    }
  };

  // ─── Create Pickup Slot ───────────────────────────────────────────────────
  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    try {
      const res = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/pickup-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch(`${BACKEND_URL}/merchants/pickup-slots/${slotId}`, {
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
      const res = await fetch(`${BACKEND_URL}/merchants/items/${itemId}`, {
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
      const res = await fetch(`${BACKEND_URL}/merchants/items/${item.id}`, {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-[#F04B14]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-red-600 bg-red-50 text-center m-8 rounded-xl font-medium">
        {error}
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ────────────────────────────────────────────────────────────────
            HEADER
        ──────────────────────────────────────────────────────────────── */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-orange-100 flex flex-wrap justify-between items-center gap-4">
          <div>
            <Link
              href="/vendor/dashboard"
              className="text-[#F04B14] hover:underline font-bold text-xs sm:text-sm inline-block mb-1"
            >
              ← Back to Vendor Dashboard
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              Stall Menu & Food Products
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Managing stall: <strong className="text-slate-800">{merchant?.name}</strong> (📍 {merchant?.location})
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white border border-slate-200 hover:border-red-300 text-slate-600 hover:text-red-600 text-xs sm:text-sm font-semibold rounded-xl transition cursor-pointer"
          >
            Log Out
          </button>
        </div>

        {/* ────────────────────────────────────────────────────────────────
            FORMS GRID: Food Product Information & Pickup Slots
        ──────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Form: Add Food Product (2 Columns on lg) ── */}
          <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-orange-100 space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                Food Product Information & Photos
              </span>
              <h2 className="text-lg font-black text-slate-900">Add New Food Item</h2>
              <p className="text-xs text-slate-500">
                Provide comprehensive item details and clear photos for campus customers.
              </p>
            </div>

            <form onSubmit={handleAddItem} className="space-y-4">
              {/* Row 1: Food Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Food Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none"
                    placeholder="e.g. Nasi Lemak Ayam Goreng"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Food Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none bg-white"
                  >
                    {FOOD_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Price & Preparation Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Price (RM) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none"
                    placeholder="e.g. 10.50 (RM 5 for Menu Rahmah)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Preparation Time ⏱️
                  </label>
                  <select
                    value={prepTime}
                    onChange={(e) => setPrepTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none bg-white"
                  >
                    {PREP_TIMES.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Description (Ingredients, Taste, Portion) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Food Description (Ingredients, Taste, Portion Size)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none"
                  placeholder="Crispy fried chicken with aromatic coconut rice, roasted peanuts, crunchy anchovies, and spicy sweet sambal..."
                  rows={2}
                />
              </div>

              {/* Row 4: Food Variations (Spiciness & Size) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Spiciness Level
                  </label>
                  <select
                    value={spiceLevel}
                    onChange={(e) => setSpiceLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none bg-white"
                  >
                    {SPICE_LEVELS.map((sp) => (
                      <option key={sp.label} value={sp.label}>
                        {sp.emoji} {sp.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Portion / Size Variation
                  </label>
                  <select
                    value={sizeVariation}
                    onChange={(e) => setSizeVariation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none bg-white"
                  >
                    <option value="Regular">Regular (Standard Portion)</option>
                    <option value="Large">Large / Upsize</option>
                    <option value="Family Set">Family / Sharing Set</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Add-ons / Extra Toppings */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Add-ons / Extra Toppings (Optional)
                </label>
                <input
                  type="text"
                  value={addons}
                  onChange={(e) => setAddons(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs sm:text-sm text-slate-900 outline-none"
                  placeholder="e.g. Extra Sambal (+RM1), Fried Egg (+RM1.50), Cheese Slice (+RM2)"
                />
              </div>

              {/* Row 6: Dietary & Allergen Pills */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Dietary Badges (Select all that apply)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((diet) => {
                      const selected = selectedDietary.includes(diet);
                      return (
                        <button
                          key={diet}
                          type="button"
                          onClick={() =>
                            setSelectedDietary(
                              selected ? selectedDietary.filter((d) => d !== diet) : [...selectedDietary, diet]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            selected
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {selected ? "✓ " : ""}{diet}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Contains Allergens (Select applicable)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGEN_OPTIONS.map((alg) => {
                      const selected = selectedAllergens.includes(alg);
                      return (
                        <button
                          key={alg}
                          type="button"
                          onClick={() =>
                            setSelectedAllergens(
                              selected ? selectedAllergens.filter((a) => a !== alg) : [...selectedAllergens, alg]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            selected
                              ? "bg-amber-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {selected ? "⚠️ " : ""}{alg}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 7: Food Photo Upload & Preview Requirements */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Food Photo / Product Image (JPG, JPEG, PNG)
                </label>

                {/* Upload or URL */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png, image/jpeg, image/jpg"
                    onChange={handlePhotoUpload}
                    className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-[#F04B14] hover:file:bg-orange-100 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-medium">or paste image URL:</span>
                </div>

                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImagePreview(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs text-slate-900 outline-none"
                  placeholder="https://images.unsplash.com/photo-..."
                />

                {/* Image Preview Card */}
                {imagePreview && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-50/60 border border-orange-200 w-fit">
                    <img
                      src={imagePreview}
                      alt="Food preview"
                      className="h-16 w-16 rounded-lg object-cover border border-orange-200"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Photo Preview</p>
                      <button
                        type="button"
                        onClick={handleClearPhoto}
                        className="text-xs text-red-600 hover:underline font-semibold mt-1"
                      >
                        Remove / Replace Photo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-[#F04B14] hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition text-xs sm:text-sm shadow-md cursor-pointer"
              >
                + Add Food Item to Stall Menu
              </button>
            </form>
          </div>

          {/* ── Pickup Slot Generator (1 Column on lg) ── */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-orange-100 h-fit space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                Capacity & Timing
              </span>
              <h2 className="text-lg font-black text-slate-900">Create Pickup Slot</h2>
              <p className="text-xs text-slate-500">
                Set time intervals and order limits to manage stall congestion.
              </p>
            </div>

            <form onSubmit={handleCreateSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Time Slot Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newSlot.time_slot}
                  onChange={(e) => setNewSlot({ ...newSlot, time_slot: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs text-slate-900 outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Max Capacity (Orders)
                </label>
                <input
                  type="number"
                  required
                  value={newSlot.max_capacity}
                  onChange={(e) => setNewSlot({ ...newSlot, max_capacity: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#F04B14] text-xs text-slate-900 outline-none"
                  placeholder="10"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl transition text-xs shadow cursor-pointer"
              >
                + Generate Pickup Slot
              </button>
            </form>

            {/* List of active pickup slots */}
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase mb-2">
                Active Slots ({slots.length})
              </h3>
              {slots.length === 0 ? (
                <p className="text-xs text-slate-400">No pickup slots generated yet.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {new Date(slot.time_slot).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Bookings: {slot.current_bookings} / {slot.max_capacity}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="text-red-600 hover:underline font-semibold text-xs px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────
            CURRENT MENU LIST (Rich Cards with Photos & Badges)
        ──────────────────────────────────────────────────────────────── */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-orange-100 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-slate-900">Current Stall Menu</h2>
              <p className="text-xs text-slate-500">
                {menuItems.length} active menu dishes registered
              </p>
            </div>
          </div>

          {menuItems.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs sm:text-sm">
              <p className="text-3xl mb-1">🍽️</p>
              <p>Your stall menu is empty. Add your food products above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition"
                >
                  {/* Food Photo */}
                  <div className="relative h-36 w-full bg-slate-100 overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-3xl">
                        🍽️
                      </div>
                    )}
                    <span
                      className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow ${
                        item.is_available
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white"
                      }`}
                    >
                      {item.is_available ? "Available" : "Sold Out"}
                    </span>
                  </div>

                  {/* Food Info */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start gap-1">
                      <h3 className="font-bold text-slate-900 text-sm">{item.name}</h3>
                      <span className="font-extrabold text-[#F04B14] text-sm shrink-0">
                        RM {Number(item.price).toFixed(2)}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-3 text-xs text-slate-500 whitespace-pre-line flex-1">
                      {item.description || "Freshly made daily."}
                    </p>

                    {/* Action Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer ${
                          item.is_available
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {item.is_available ? "Mark as Sold Out" : "Mark as Available"}
                      </button>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-xs text-red-600 hover:underline font-bold px-2 py-1 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
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
