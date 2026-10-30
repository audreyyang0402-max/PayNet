export function isDisplayableFood(item: { price: number | string; image_url?: string | null }) {
  return Number.isFinite(Number(item.price)) && Number(item.price) > 0 && Boolean(item.image_url?.trim());
}
