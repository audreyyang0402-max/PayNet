import { BACKEND_URL } from "@/lib/backend-url";
// frontend/src/lib/api.ts

const API_URL = `${BACKEND_URL}`;

export interface Merchant {
  id: string;
  name: string;
  description: string;
  location: string;
  is_active: boolean;
}

export async function fetchMerchants(): Promise<Merchant[]> {
  const res = await fetch(`${API_URL}/merchants`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error("Failed to fetch merchants from backend");
  }
  return res.json();
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  merchant_id: string;
}

export async function fetchMerchantItems(merchantId: string): Promise<MenuItem[]> {
  const res = await fetch(`${API_URL}/merchants/${merchantId}/items`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error("Failed to fetch menu items");
  }
  return res.json();
}