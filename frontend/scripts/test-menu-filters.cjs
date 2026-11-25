// Run with: node scripts/test-menu-filters.cjs. No API or database connections.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
};
const { matchesFilters, EMPTY_FILTERS } = require("../src/lib/menu-filters.ts");
const { customerPrice, offerIsActive } = require("../src/lib/promotions.ts");
const merchants = [{ id: "m", name: "Coffee Stall", location: "Boulevard" }];
const item = { id: "i", merchant_id: "m", name: "Not spicy latte", price: 12, is_available: true,
  description: "Coffee [Category: Beverages | Spiciness: Non-Spicy | Dietary: Halal, Vegetarian | Customizations: None]" };
const match = (filters, candidate = item) => matchesFilters(candidate, { ...EMPTY_FILTERS, ...filters }, merchants, ["m"]);
assert.ok(match({ categories: ["Main Course", "Beverages"], dietary: ["Halal", "Vegetarian"], location: "Boulevard", pickup: true, query: "coffee stall" }));
assert.equal(match({ dietary: ["Vegan"] }), false);
assert.equal(match({ max: "10" }), false);
assert.equal(match({ merchants: ["other"] }), false);
assert.equal(match({ spice: "not" }, { ...item, description: "No declared spice" }), false);
assert.equal(match({ customizable: true }), false);
assert.ok(match({ spice: "not" }));
const sale = { ...item, promotion: { id: "p", name: "Lunch", starts_at: "2020-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", sale_price: 8 } };
assert.ok(match({ max: "10", deals: true }, sale));
assert.equal(customerPrice(sale).price, 8);
assert.equal(customerPrice(customerPrice(sale)).original_price, 12);
assert.equal(customerPrice(sale, Date.parse("2100-01-01")).price, 12);
assert.equal(offerIsActive(sale.promotion, Date.parse("2099-01-01")), false);
assert.equal(offerIsActive(sale.promotion, Date.parse("2019-01-01")), false);
console.log("Passed 13 combined-filter and promotion-price checks.");
