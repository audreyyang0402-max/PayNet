# Promotions and discovery filters

## Rollout

Deploy the backend before the frontend. Backend startup runs the existing
idempotent migration runner to create `promotions` and add nullable original
prices/promotion IDs and default-zero discounts to `order_items`. Existing orders
retain their actual historical `price_at_order`; no historical discounts are inferred.
No migration or deployment is executed by the offline test suite.

The database account used by backend startup needs permission to create the table,
indexes and columns. Check startup logs before deploying the frontend.

No new service, API key or external analytics product is required.

## Merchant workflow

- Menu → Deals & Discounts: select a dish, name the offer, choose percentage or
  RM off, and enter its start/end in Malaysia time (UTC+8).
- An offer runs for up to 90 days. Overlapping offers for the same dish are rejected.
  Creation is serialized per merchant to prevent concurrent overlap checks racing.
- Stop an offer to end it early. Stopped campaigns remain available in reports.
  Create a new campaign to change its terms rather than rewriting historical offers.
- Overview → Promotion performance: view campaign-lifetime results. This section
  refreshes separately and does not use the overview's 7/30/90-day selector.

## Price safety

The menu API keeps `price` as the normal menu price for merchant editors and adds
an active `promotion` object with `sale_price`. Customer screens normalize the
displayed price, and send `expected_price` with each checkout line. The backend
recalculates eligibility and prices; a changed/expired offer returns 409 before
creating an order or reserving capacity. Older clients can omit `expected_price`.

Each new order line stores normal unit price, actual unit price, unit discount,
and promotion ID. Existing payment, email and order flows continue using actual
`price_at_order` and `total_price`. Discounts do not stack; the minimum payable
unit price is RM0.01 even if a later normal-price change exceeds a fixed discount.

## Report interpretation

- Includes vendor-confirmed orders: preparing, ready and completed.
- Orders with any tracked refund case are excluded from both comparison groups.
  Promotion line value excluded this way is shown separately. This is deliberately
  not described as net refunded revenue: a case may still be pending or disputed.
- Comparison uses an equally long earlier window shifted by whole weeks to match
  weekday/time and prevent overlap. Only non-promotional sales of the same dish
  form the normal-price baseline. Current campaign time is truncated to now,
  its scheduled end or its stop time, whichever comes first.
- Rates use elapsed calendar-day equivalents, not verified open trading days.
  Opening hours, sold-out time, other offers, holidays and traffic are not controlled.
- Zero baseline means the percentage change is unavailable, never infinity or 100%.
  Short observation time and fewer than five orders in either group trigger a notice.
- Results are historical associations, not causal uplift, profit or ROI.
- Views/click funnels, bundles, redemption caps and cost-based margin reporting
  are not part of this first version.

## Customer discovery

The existing orange section now supports combined search, min/max price, multiple
categories and stalls, location, declared dietary/spice attributes, spice
customisation, active discounts and upcoming pickup availability. Choices within
category/stall groups are OR; different groups and selected dietary requirements
are AND. Missing declared attributes do not match. The result count, removable
chips and reset control reflect the current quick category and filters.

Best Value uses the lowest-quarter price threshold; it is distinct from an actual
merchant discount. Sorting supports popularity, price and percentage discount.
Upcoming pickup/popularity refresh while the section is open. Reload the menu to
fetch newly created/stopped campaigns; checkout always revalidates the price.

## Offline verification

From backend: `venv\Scripts\python.exe -m unittest discover -p "test_*.py"`

From frontend: `node scripts/test-menu-filters.cjs`

From frontend: `node_modules\.bin\tsc.cmd --noEmit --incremental false`

API/service tests use mocks and test-only settings; they do not connect to the
production database. Before production rollout, verify migrations and an entire
discounted checkout/refund cycle in a separate database environment.
