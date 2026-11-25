import { getMenuCustomizationPolicy, menuMetadataValue, parseMenuDescription } from "./menu-customizations";
import { customerPrice, offerIsActive, type Offer } from "./promotions";

export type DiscoveryItem = { id: string; merchant_id: string; name: string; description: string | null; price: number; original_price?: number; promotion?: Offer | null; is_available: boolean; image_url?: string | null };
export type DiscoveryMerchant = { id: string; name: string; location?: string };
export type MenuFilters = { query: string; min: string; max: string; categories: string[]; merchants: string[]; location: string; spice: string; dietary: string[]; deals: boolean; customizable: boolean; pickup: boolean };
export const EMPTY_FILTERS: MenuFilters = { query: "", min: "", max: "", categories: [], merchants: [], location: "", spice: "", dietary: [], deals: false, customizable: false, pickup: false };

export function metadata(item: DiscoveryItem, key: string) {
  return menuMetadataValue(parseMenuDescription(item.description).tags, key) || "";
}

export function matchesFilters(item: DiscoveryItem, filters: MenuFilters, merchants: DiscoveryMerchant[], pickupIds: string[]) {
  const merchant = merchants.find((m) => m.id === item.merchant_id);
  const text = `${item.name} ${parseMenuDescription(item.description).description} ${merchant?.name || ""}`.toLowerCase();
  const price = Number(customerPrice(item).price);
  const dietary = metadata(item, "Dietary").split(",").map((v) => v.trim().toLowerCase());
  const spice = metadata(item, "Spiciness").toLowerCase();
  const spiceMatches = !filters.spice || (filters.spice === "not" ? ["non-spicy", "not spicy", "non spicy"].includes(spice)
    : filters.spice === "mild" ? ["mild spicy", "mild"].includes(spice) : ["medium spicy", "extra spicy", "spicy", "hot"].includes(spice));
  return (!filters.query.trim() || text.includes(filters.query.trim().toLowerCase()))
    && (!filters.min || price >= Number(filters.min)) && (!filters.max || price <= Number(filters.max))
    && (!filters.categories.length || filters.categories.includes(metadata(item, "Category")))
    && (!filters.merchants.length || filters.merchants.includes(item.merchant_id))
    && (!filters.location || merchant?.location === filters.location)
    && filters.dietary.every((v) => dietary.includes(v.toLowerCase())) && spiceMatches
    && (!filters.deals || offerIsActive(item.promotion))
    && (!filters.customizable || getMenuCustomizationPolicy(item.name, item.description).allowsSpice)
    && (!filters.pickup || pickupIds.includes(item.merchant_id));
}
