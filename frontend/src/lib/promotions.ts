export type Offer = { id: string; name: string; starts_at: string; ends_at: string; sale_price: number };

export function offerIsActive(offer?: Offer | null, now = Date.now()) {
  return !!offer && new Date(offer.starts_at).getTime() <= now && new Date(offer.ends_at).getTime() > now;
}

export function customerPrice<T extends { price: number; original_price?: number; promotion?: Offer | null }>(item: T, now = Date.now()): T {
  const original = item.original_price ?? Number(item.price);
  return { ...item, original_price: original, price: offerIsActive(item.promotion, now) ? Number(item.promotion!.sale_price) : original };
}
