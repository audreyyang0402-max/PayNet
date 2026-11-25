# Sunway Express Lane food planning pilot

## What is available now

The merchant portal's **Food Planning** tab records prepared, unsold and discarded portions per dish and day, plus whether the dish sold out. It shows the last 30 days of logged outcomes. The API uses merchant authentication and checks that each dish belongs to the merchant. The new `daily_food_logs` table is created by the backend's startup migrations on deployment; `SCHEMA.sql` also includes it for a fresh database. Direct browser access to the table is blocked by row-level security with no client policy.

Each new daily record now asks whether the dish was actually offered. Older records keep an unknown answer until the merchant reviews them. A review queue highlights recent pickup dish days with no record. The dataset exports confirmed unavailable days with blank demand rather than zero; confirmed available days with no app orders can have a real zero. A record marked unavailable cannot contain prepared, unsold, discarded or sold-out quantities, and cannot contradict already confirmed app orders. This distinguishes missing data from genuinely quiet days.

The first demand estimate is intentionally a **baseline, not a trained AI model**. For each upcoming day with pickup slots, it averages confirmed dish quantities from the same weekday during the prior eight weeks, considering only days when the stall offered pickup slots and after the dish was created. If at least three comparable days have preparation records, it uses those known available days. Otherwise it assumes the dish was available on open-stall days and labels availability as unverified. Its range is one observed standard deviation around that average and is **not** a calibrated probability interval. It never suggests fewer portions than already confirmed for that day. Missing or sparse history is shown explicitly. Merchants decide actual preparation quantities and pickup capacity.

The merchant display also reports walk-forward mean absolute error when at least five comparable days exist. Each test prediction uses only earlier days. The comparison is the most recent comparable day's observed demand. This is retrospective model checking, not a prospective claim of impact.

Admin analytics now has a **Download CSV** action for a pseudonymous dish/day dataset. It includes pickup-slot count and capacity, confirmed portions and order count, and merchant-entered preparation outcomes. `merchant_code` and `dish_code` are stable keyed hashes; no names, contact details, receipts or bank details are exported. If there is no evidence that a dish was available on a day, `availability_evidence` is `unknown` and demand is blank rather than zero. Only admins can call this export endpoint. A CSV download still needs restricted storage and handling by the research team.

Merchants can now set an optional **daily bookable portion limit** per dish and pickup date. Checkout reserves portions in a draft order, counts them through completion, and excludes cancelled or rejected orders. A stale unpaid draft releases its reservation after expiry. A database lock serializes checkout and cap changes, and checkout rejects a cart that exceeds the remaining amount before payment. The pickup date is saved on each new order so a completed order still counts if its old slot is removed. A blank limit means no cap; zero prevents new orders for that dish/date. These caps represent bookable portions, not a measured kitchen inventory balance.

The merchant portal also supports **same-day surplus offers** for an approved dish and a specific future pickup slot. The merchant confirms the portions are suitable to sell, chooses a lower price, a fixed quantity and an order deadline. The marketplace shows only offers that are still available. Checkout enforces the offer quantity, expiry and pickup slot under the same merchant lock as daily portion limits; it calculates the discounted price on the server and records the offer ID on each order line. Ending an offer stops new purchases but leaves agreed prices on existing orders. These offers are merchant-declared stock, not a verified measurement of prevented food waste. A purchase alone does not prove the food would otherwise have been discarded.

Surplus Meals now reports listing capacity, confirmed and completed portions, pending and rejected portions, confirmed order value, and merchant-recorded discards on the same dish days. A dish/day log is counted once even if its offer was relisted. Listing quantities can count the same physical portions more than once, so they must not be interpreted as food saved. Past offer dish days without a food record are visible as missing coverage.

The CSV includes the cap and a `demand_censored` flag. Hitting a cap or reporting a sellout means observed sales might be lower than real demand. The current baseline excludes those days where known. Historical availability and sellout records are still incomplete, so forecasts remain provisional.

A **regularized weekday/trend regression** is now available as a candidate forecast. It trains only on at least 42 merchant-verified, uncensored pickup dish days from the previous 180 days. Dates are split in chronological order into training, validation and later holdout periods. Validation selects the regression only when its mean absolute error beats the weekday baseline by more than 0.25 portions; the later holdout is scored after selection and does not select the model. When history is too sparse or the baseline validates as well, the merchant still sees the existing eight-week weekday estimate. The forecast band uses validation error for planning and is not a calibrated probability interval. Model training happens when Food Planning loads; the 20-second refresh does not imply continuous training in the background.

## Data definitions

- **Confirmed demand:** quantities in `preparing`, `ready` or `completed` orders attached to pickup slots. Pending payments are excluded. A deleted historical pickup slot cannot contribute to this baseline.
- **Prepared:** portions the merchant actually made that day.
- **Unsold:** portions still available at closing; these are not automatically counted as waste.
- **Discarded:** portions thrown away. Merchant enters this value; the app cannot infer it from orders.
- **Sold out:** merchant reports that the dish ran out on that day.
- **Discarded share:** discarded portions divided by prepared portions across logged dish days. It is undefined until preparation is logged.

These metrics are portion counts, not food weight, nutrition, carbon emissions or net profit. No payment receipts, customer banking details, names or dietary profiles are used for the forecast.

## Research evaluation before claiming impact

1. Recruit consenting pilot stalls and establish a baseline period. Record opening days, prepared portions, leftovers, discards and sellouts consistently.
2. Export the pseudonymous dish/day dataset and remove rows with unknown availability from model training. Add verified context variables such as campus events only when collected consistently. Keep merchants' raw commercial data access controlled.
3. Compare a simple weekday average against candidate models using chronological holdout dates. Report MAE and error by stall and dish. Do not shuffle future observations into training.
4. Pilot merchant-visible suggestions with human override. Compare discarded portions, sell-out days, rejected orders, revenue and pickup delays against the baseline. Report sample size, missing logs and uncertainty; do not claim causality from a simple before/after change alone.
5. Evaluate surplus offers using merchant-recorded preparation and discard logs. Record offer quantity, purchases, expiries, rejected orders and actual discarded portions separately. Do not infer that every unsold portion can safely be resold or that every discounted sale prevented waste.

The dashboard refreshes every 20 seconds while visible. This refreshes observed records; it does not retrain a model every 20 seconds.
