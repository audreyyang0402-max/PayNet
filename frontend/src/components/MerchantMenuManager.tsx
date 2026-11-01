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
import {
  getMenuCustomizationPolicy,
  isHotMenuItemName,
  MenuCustomization,
  parseMenuDescription,
  withMenuCustomizationPolicy,
} from "@/lib/menu-customizations";

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

interface CustomizationDraft {
  sugar: boolean;
  ice: boolean;
  specialRequests: boolean;
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

export function MerchantMenuManager({ embedded = false }: { embedded?: boolean }) {
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
  const [allowSugarCustomization, setAllowSugarCustomization] = useState(false);
  const [allowIceCustomization, setAllowIceCustomization] = useState(false);
  const [allowSpecialRequests, setAllowSpecialRequests] = useState(true);
  const [editingCustomizationItemId, setEditingCustomizationItemId] = useState<string | null>(null);
  const [customizationDraft, setCustomizationDraft] = useState<CustomizationDraft>({
    sugar: false,
    ice: false,
    specialRequests: true,
  });
  const [savingCustomizationItemId, setSavingCustomizationItemId] = useState<string | null>(null);

  // ── Form State: Food Photo & Preview ──
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);

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

        // These independent requests run together after the merchant profile
        // is known, reducing the wait when vendors open menu management.
        const [menuRes, slotsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/merchants/${profileData.id}/items`),
          fetch(`${BACKEND_URL}/merchants/${profileData.id}/pickup-slots`),
        ]);
        if (menuRes.ok) {
          const menuData = await menuRes.json();
          setMenuItems(menuData);
        }
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

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // ─── Photo Upload & Preview Handler (JPG, JPEG, PNG) ──────────────────────
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      alert("Please upload a valid JPG, JPEG, or PNG image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Please choose an image that is 5 MB or smaller.");
      e.target.value = "";
      return;
    }

    // Keep the preview local, then upload the actual file to cloud storage on submit.
    setImageFile(file);
    setImageUrl("");
    setImagePreview(URL.createObjectURL(file));
  };

  const handleClearPhoto = () => {
    setImagePreview(null);
    setImageUrl("");
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Add Menu Item Handler ────────────────────────────────────────────────
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    setSavingItem(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Your session has expired. Please log in again.");

      let finalImageUrl = imageUrl.trim();
      if (imageFile) {
        const uploadBody = new FormData();
        uploadBody.append("image_file", imageFile);
        const uploadRes = await fetch(`${BACKEND_URL}/merchants/menu-image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: uploadBody,
        });
        if (!uploadRes.ok) {
          const uploadError = await uploadRes.json().catch(() => null);
          throw new Error(uploadError?.detail || "Failed to upload the food photo.");
        }
        const uploaded = await uploadRes.json();
        finalImageUrl = uploaded.image_url;
      }

      // Build structured tag metadata into description
      const tags: string[] = [];
      if (category) tags.push(`Category: ${category}`);
      if (spiceLevel) tags.push(`Spiciness: ${spiceLevel}`);
      if (prepTime) tags.push(`Prep: ${prepTime}`);
      if (selectedDietary.length > 0) tags.push(`Dietary: ${selectedDietary.join(", ")}`);
      if (selectedAllergens.length > 0) tags.push(`Allergens: ${selectedAllergens.join(", ")}`);
      if (addons.trim()) tags.push(`Add-ons: ${addons.trim()}`);
      if (sizeVariation) tags.push(`Size: ${sizeVariation}`);
      const customizationOptions: MenuCustomization[] = [];
      if (category === "Beverages" && allowSugarCustomization) customizationOptions.push("Sugar");
      if (category === "Beverages" && allowIceCustomization && !isHotMenuItemName(name)) customizationOptions.push("Ice");
      if (allowSpecialRequests) customizationOptions.push("Special requests");
      tags.push(`Customizations: ${customizationOptions.length > 0 ? customizationOptions.join(", ") : "None"}`);

      const compiledDescription = tags.length > 0
        ? `${description.trim()}\n[${tags.join(" | ")}]`
        : description.trim();

      const res = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: compiledDescription,
          price: parseFloat(price),
          is_available: true,
          image_url: finalImageUrl || null,
        }),
      });

      if (!res.ok) {
        const itemError = await res.json().catch(() => null);
        throw new Error(itemError?.detail || "Failed to add menu item.");
      }

      const addedItem = await res.json();
      setMenuItems([...menuItems, addedItem]);

      // Reset form
      setName("");
      setDescription("");
      setPrice("");
      setAddons("");
      setAllowSugarCustomization(false);
      setAllowIceCustomization(false);
      setAllowSpecialRequests(true);
      handleClearPhoto();
      alert("Food product added to your stall menu successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to add food product.");
    } finally {
      setSavingItem(false);
    }
  };

  // ─── Create Pickup Slot ───────────────────────────────────────────────────
  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    try {
      const token = localStorage.getItem("token");

      // Append +08:00 timezone offset so local time doesn't shift unexpectedly
      const formattedTimeSlot = newSlot.time_slot.includes("+") || newSlot.time_slot.endsWith("Z")
        ? newSlot.time_slot
        : `${newSlot.time_slot}:00+08:00`;

      const res = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/pickup-slots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          time_slot: formattedTimeSlot,
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
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/merchants/pickup-slots/${slotId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to delete pickup slot.");
      }

      setSlots(slots.filter((s) => s.id !== slotId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const beginEditingCustomerOptions = (item: MenuItem) => {
    const policy = getMenuCustomizationPolicy(item.name, item.description);
    setCustomizationDraft({
      sugar: policy.allowsSugar,
      ice: policy.allowsIce,
      specialRequests: policy.allowsSpecialRequests,
    });
    setEditingCustomizationItemId(item.id);
  };

  const handleSaveCustomerOptions = async (item: MenuItem) => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Your session has expired. Please log in again.");
      return;
    }

    const policy = getMenuCustomizationPolicy(item.name, item.description);
    const options: MenuCustomization[] = [];
    if (policy.isBeverage && customizationDraft.sugar) options.push("Sugar");
    if (policy.isBeverage && !policy.isHot && customizationDraft.ice) options.push("Ice");
    if (customizationDraft.specialRequests) options.push("Special requests");

    setSavingCustomizationItemId(item.id);
    try {
      const res = await fetch(`${BACKEND_URL}/merchants/items/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: item.name,
          description: withMenuCustomizationPolicy(item.description, options),
          price: item.price,
          image_url: item.image_url,
          is_available: item.is_available,
        }),
      });
      if (!res.ok) {
        const updateError = await res.json().catch(() => null);
        throw new Error(updateError?.detail || "Failed to update customer options.");
      }
      const updated = await res.json();
      setMenuItems((current) => current.map((menuItem) => menuItem.id === item.id ? updated : menuItem));
      setEditingCustomizationItemId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update customer options.");
    } finally {
      setSavingCustomizationItemId(null);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;

    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${BACKEND_URL}/merchants/items/${itemId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.detail || "Failed to delete item.");

      if (result.hidden) {
        // The item has past orders, so the backend hid it instead of deleting it.
        setMenuItems(menuItems.map((i) => (i.id === itemId ? { ...i, is_available: false } : i)));
        alert(result.message);
      } else {
        setMenuItems(menuItems.filter((i) => i.id !== itemId));
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${BACKEND_URL}/merchants/items/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
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

  const Container = embedded ? "section" : "main";
  return (
    <Container className={embedded ? "space-y-6" : "min-h-screen p-4 sm:p-6 md:p-8"}>
      <div className={embedded ? "space-y-6" : "max-w-6xl mx-auto space-y-6"}>
        {/* ────────────────────────────────────────────────────────────────
            HEADER
        ──────────────────────────────────────────────────────────────── */}
        {!embedded && <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-orange-100 flex flex-wrap justify-between items-center gap-4">
          <div>
            <Link
              href="/vendor/dashboard"
              className="inline-block rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 mb-3"
            >
              Back to merchant portal
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
        </div>}

        {/* ────────────────────────────────────────────────────────────────
            FORMS GRID: Food Product Information & Pickup Slots
        ──────────────────────────────────────────────────────────────── */}
        <div className={`grid gap-6 ${embedded ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
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
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setName(nextName);
                      if (isHotMenuItemName(nextName)) setAllowIceCustomization(false);
                    }}
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
                    onChange={(e) => {
                      const nextCategory = e.target.value;
                      setCategory(nextCategory);
                      if (nextCategory === "Beverages") {
                        setAllowSugarCustomization(true);
                        setAllowIceCustomization(false);
                      } else {
                        setAllowSugarCustomization(false);
                        setAllowIceCustomization(false);
                      }
                    }}
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

              <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-800">Customer customization options</p>
                    <p className="mt-0.5 text-xs text-slate-500">Only checked options will appear on this item.</p>
                  </div>
                  {category === "Beverages" && isHotMenuItemName(name) && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">Hot item: ice disabled</span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <CustomizationCheckbox
                    label="Sugar level"
                    description="Normal, less or no sugar"
                    checked={allowSugarCustomization}
                    disabled={category !== "Beverages"}
                    onChange={setAllowSugarCustomization}
                  />
                  <CustomizationCheckbox
                    label="Ice level"
                    description="Normal, less or no ice"
                    checked={allowIceCustomization}
                    disabled={category !== "Beverages" || isHotMenuItemName(name)}
                    onChange={setAllowIceCustomization}
                  />
                  <CustomizationCheckbox
                    label="Special request note"
                    description="Simple preparation notes"
                    checked={allowSpecialRequests}
                    onChange={setAllowSpecialRequests}
                  />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-amber-800">
                  Create hot and cold drinks as separate menu items with their own prices. Customers cannot use these options to change temperature, size, or priced add-ons.
                </p>
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
                    setImageFile(null);
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
                disabled={savingItem}
                className="w-full bg-[#F04B14] hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60 text-white font-bold py-3 rounded-xl transition text-xs sm:text-sm shadow-md cursor-pointer"
              >
                {savingItem ? "Uploading & saving…" : "+ Add Food Item to Stall Menu"}
              </button>
            </form>
          </div>

          {/* ── Pickup Slot Generator (1 Column on lg) — hidden when embedded in dashboard Pickup Slots tab ── */}
          {!embedded && <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-orange-100 h-fit space-y-4">
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
                          {slot.current_bookings >= slot.max_capacity && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">FULL</span>
                          )}
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
          </div>}
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
              {menuItems.map((item) => {
                const policy = getMenuCustomizationPolicy(item.name, item.description);
                const parsedDescription = parseMenuDescription(item.description);
                const enabledOptions = [
                  policy.allowsSugar ? "Sugar" : null,
                  policy.allowsIce ? "Ice" : null,
                  policy.allowsSpecialRequests ? "Notes" : null,
                ].filter((option): option is string => Boolean(option));
                const isEditingOptions = editingCustomizationItemId === item.id;

                return (
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
                      {parsedDescription.description || "Freshly made daily."}
                    </p>

                    <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800">Customer options</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {enabledOptions.length > 0 ? enabledOptions.map((option) => (
                              <span key={option} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">{option}</span>
                            )) : (
                              <span className="text-[11px] font-semibold text-slate-500">None</span>
                            )}
                            {!policy.hasExplicitPolicy && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Review legacy item</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => isEditingOptions ? setEditingCustomizationItemId(null) : beginEditingCustomerOptions(item)}
                          className="shrink-0 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-orange-700 hover:bg-orange-100"
                        >
                          {isEditingOptions ? "Cancel" : "Edit"}
                        </button>
                      </div>

                      {isEditingOptions && (
                        <div className="mt-3 space-y-2 border-t border-orange-100 pt-3">
                          <CustomizationCheckbox
                            label="Sugar level"
                            description="Normal, less or no sugar"
                            checked={customizationDraft.sugar}
                            disabled={!policy.isBeverage}
                            onChange={(checked) => setCustomizationDraft((current) => ({ ...current, sugar: checked }))}
                          />
                          <CustomizationCheckbox
                            label="Ice level"
                            description={policy.isHot ? "Unavailable for hot items" : "Normal, less or no ice"}
                            checked={customizationDraft.ice}
                            disabled={!policy.isBeverage || policy.isHot}
                            onChange={(checked) => setCustomizationDraft((current) => ({ ...current, ice: checked }))}
                          />
                          <CustomizationCheckbox
                            label="Special request note"
                            description="No temperature, size, or paid changes"
                            checked={customizationDraft.specialRequests}
                            onChange={(checked) => setCustomizationDraft((current) => ({ ...current, specialRequests: checked }))}
                          />
                          <button
                            type="button"
                            disabled={savingCustomizationItemId === item.id}
                            onClick={() => handleSaveCustomerOptions(item)}
                            className="w-full rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-60"
                          >
                            {savingCustomizationItemId === item.id ? "Saving..." : "Save customer options"}
                          </button>
                        </div>
                      )}
                    </div>

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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

function CustomizationCheckbox({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-2.5 ${disabled ? "cursor-not-allowed border-slate-100 opacity-55" : "border-slate-200 hover:border-orange-300"}`}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-orange-600"
      />
      <span className="min-w-0">
        <span className="block text-xs font-bold text-slate-800">{label}</span>
        <span className="block text-[10px] leading-relaxed text-slate-500">{description}</span>
      </span>
    </label>
  );
}

export default MerchantMenuManager;
