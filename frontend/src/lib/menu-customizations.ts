export type MenuCustomization = "Sugar" | "Ice" | "Spice" | "Special requests";
export const CUSTOMER_SPICE_LEVELS = ["Not spicy", "Less spicy", "Normal spicy", "More spicy", "Extra spicy"];
export interface SpiceOptions { levels: string[]; defaultLevel: string }

const BEVERAGE_PATTERN = /\b(coffee|latte|tea|teh|kopi|cocoa|chocolate|juice|smoothie|drink|beverage|soda|milk)\b/i;
const HOT_PATTERN = /(?:^|[\s(\[/_-])(hot|panas)(?=$|[\s)\]/_-])/i;
const COLD_PATTERN = /(?:^|[\s(\[/_-])(cold|iced|ice|sejuk)(?=$|[\s)\]/_-])/i;

export interface ParsedMenuDescription {
  description: string;
  tags: string[];
}

export interface MenuCustomizationPolicy {
  isBeverage: boolean;
  isHot: boolean;
  allowsSugar: boolean;
  allowsIce: boolean;
  allowsSpice: boolean;
  spiceLevels: string[];
  defaultSpice: string;
  allowsSpecialRequests: boolean;
  hasExplicitPolicy: boolean;
}

export function parseMenuDescription(value?: string | null): ParsedMenuDescription {
  const raw = value?.trim() || "";
  const metadata = raw.match(/\[([^\]]+)\]\s*$/)?.[1] || "";
  return {
    description: raw.replace(/\s*\[[^\]]+\]\s*$/, "").trim(),
    tags: metadata.split("|").map((part) => part.trim()).filter(Boolean),
  };
}

export function menuMetadataValue(tags: string[], key: string): string | null {
  const prefix = `${key.toLowerCase()}:`;
  const tag = tags.find((entry) => entry.toLowerCase().startsWith(prefix));
  return tag ? tag.slice(tag.indexOf(":") + 1).trim() : null;
}

export function getMenuCustomizationPolicy(name: string, value?: string | null): MenuCustomizationPolicy {
  const parsed = parseMenuDescription(value);
  const category = menuMetadataValue(parsed.tags, "Category") || "";
  const customizations = menuMetadataValue(parsed.tags, "Customizations");
  const optionSet = new Set(
    (customizations || "")
      .split(",")
      .map((option) => option.trim().toLowerCase())
      .filter(Boolean),
  );
  const searchableText = `${name} ${parsed.description}`;
  const isBeverage = /beverages?/i.test(category) || BEVERAGE_PATTERN.test(searchableText);
  const isHot = HOT_PATTERN.test(name);
  const isCold = COLD_PATTERN.test(name);
  const hasExplicitPolicy = customizations !== null;
  const configuredLevels = (menuMetadataValue(parsed.tags, "Spice choices") || "").split(",").map((level) => level.trim());
  const spiceLevels = CUSTOMER_SPICE_LEVELS.filter((level) => configuredLevels.includes(level));
  const defaultSpice = menuMetadataValue(parsed.tags, "Default spice") || "";

  return {
    isBeverage,
    isHot,
    allowsSpice: optionSet.has("spice") && spiceLevels.length > 0,
    spiceLevels,
    defaultSpice: spiceLevels.includes(defaultSpice) ? defaultSpice : (spiceLevels[0] || "Normal spicy"),
    allowsSugar: isBeverage && (hasExplicitPolicy ? optionSet.has("sugar") : true),
    // Hot items never expose ice controls. Legacy items receive ice controls
    // only when their item name explicitly says cold or iced.
    allowsIce: isBeverage && !isHot && (hasExplicitPolicy ? optionSet.has("ice") : isCold),
    allowsSpecialRequests: hasExplicitPolicy ? optionSet.has("special requests") : true,
    hasExplicitPolicy,
  };
}

export function withMenuCustomizationPolicy(
  value: string | null | undefined,
  options: MenuCustomization[],
  spice?: SpiceOptions,
): string {
  const parsed = parseMenuDescription(value);
  const tags = parsed.tags.filter((tag) => !/^(customizations|spice choices|default spice)\s*:/i.test(tag));
  if (options.includes("Spice")) {
    const existing = getMenuCustomizationPolicy("", value);
    const levels = CUSTOMER_SPICE_LEVELS.filter((level) => (spice?.levels || existing.spiceLevels).includes(level));
    if (!levels.length) throw new Error("Select at least one spice level.");
    const preferred = spice?.defaultLevel || existing.defaultSpice;
    tags.push(`Spice choices: ${levels.join(", ")}`, `Default spice: ${levels.includes(preferred) ? preferred : levels[0]}`);
  }
  tags.push(`Customizations: ${options.length > 0 ? options.join(", ") : "None"}`);
  return `${parsed.description}${parsed.description ? "\n" : ""}[${tags.join(" | ")}]`;
}

export function isHotMenuItemName(name: string): boolean {
  return HOT_PATTERN.test(name);
}
