export interface MerchantProfile {
  id: string;
  name: string;
  location: string;
  description: string;
  duitnow_qr_url?: string;
  is_temporary?: boolean;
  is_active?: boolean;
  is_deleted?: boolean;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price_at_order: number;
  surplus_offer_id?: string | null;
  special_instructions?: string | null;
}

export interface Order {
  id: string;
  order_number?: string;
  status: string;
  total_price: number;
  created_at: string;
  customer_id: string;
  customer_name?: string;
  transaction_ref?: string;
  pickup_time?: string | null;
  items?: OrderItem[];
}

export interface PickupSlot {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

