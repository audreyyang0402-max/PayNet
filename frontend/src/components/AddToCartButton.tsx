// src/components/AddToCartButton.tsx
"use client";

import { MenuItem } from "@/lib/api";
import { useCart } from "@/context/CartContext";

export default function AddToCartButton({ item }: { item: MenuItem }) {
  const { addToCart, cart } = useCart();
  
  // Quick check to see how many of this item are in the cart
  const cartItem = cart.find((i) => i.id === item.id);
  const count = cartItem ? cartItem.quantity : 0;

  return (
    <button 
      onClick={() => addToCart(item)}
      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
    >
      Add to Order {count > 0 && <span className="bg-white text-blue-600 rounded-full px-2 py-0.5 text-xs">{count}</span>}
    </button>
  );
}