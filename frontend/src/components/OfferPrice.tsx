import { type Offer, offerIsActive } from "@/lib/promotions";

export default function OfferPrice({ item }: { item: { price: number; original_price?: number; promotion?: Offer | null } }) {
  const original = item.original_price ?? Number(item.price);
  const active = offerIsActive(item.promotion);
  const price = active ? Number(item.promotion!.sale_price) : original;
  return <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <strong className="text-orange-600">RM {price.toFixed(2)}</strong>
    {active && original > price && <>
      <del className="text-xs font-normal text-slate-400">RM {original.toFixed(2)}</del>
      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Save RM {(original - price).toFixed(2)}</span>
    </>}
  </span>;
}
