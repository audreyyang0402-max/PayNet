# Sunway Express Lane food planning pilot

## What is available now

The merchant portal's **Food Planning** tab records prepared, unsold and discarded portions per dish and day, plus whether the dish sold out. It shows the last 30 days of logged outcomes. The API uses merchant authentication and checks that each dish belongs to the merchant. The new `daily_food_logs` table is created by the backend's startup migrations on deployment; `SCHEMA.sql` also includes it for a fresh database. Direct browser access to the table is blocked by row-level security with no client policy.

The first demand estimate is intentionally a **baseline, not a trained AI model**. For each upcoming day with pickup slots, it averages confirmed dish quantities from the same weekday during the prior eight weeks, considering only days when the stall offered pickup slots and after the dish was created. If at least three comparable days have preparation records, it uses those known available days. Otherwise it assumes the dish was available on open-stall days and labels availability as unverified. Its range is one observed standard deviation around that average and is **not** a calibrated probability interval. It never suggests fewer portions than already confirmed for that day. Missing or sparse history is shown explicitly. Merchants decide actual preparation quantities and pickup capacity.

The merchant display also reports walk-forward mean absolute error when at least five comparable days exist. Each test prediction uses only earlier days. The comparison is the most recent comparable day's observed demand. This is retrospective model checking, not a prospective claim of impact.

Admin analytics now has a **Download CSV** action for a pseudonymous dish/day dataset. It includes pickup-slot count and capacity, confirmed portions and order count, and merchant-entered preparation outcomes. `merchant_code` and `dish_code` are stable keyed hashes; no names, contact details, receipts or bank details are exported. If there is no evidence that a dish was available on a day, `availability_evidence` is `unknown` and demand is blank rather than zero. Only admins can call this export endpoint. A CSV download still needs restricted storage and handling by the research team.

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
5. Add surplus offers only after defining merchant approval, food safety checks, pricing, expiry and payment/refund behavior. Do not infer that every unsold portion can safely be resold.

The dashboard refreshes every 20 seconds while visible. This refreshes observed records; it does not retrain a model every 20 seconds.
