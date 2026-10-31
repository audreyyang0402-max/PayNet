# Payvolution event vendors

1. Existing shops use their existing Merchant account. New permanent shops register as Merchant.
2. Temporary Boulevard sellers register as Pop-up Vendor, verify their email and submit a rental booking. Admin approval creates their shop if needed.
3. The merchant edits their store profile, uploads their DuitNow QR, and adds dishes and pickup slots through Manage Menu & Slots. Marketplace dishes require a positive price and an image.
4. The admin opens Merchants & events from the rental dashboard, creates an event with its full date range (Malaysian time), selects a merchant, and assigns that merchant to the event. Repeat for other vendors.

Rental approval and event assignment are separate. One menu is shared across the merchant's shop and event listing. Upcoming/current event assignments put shops in the Payvolution Event section instead of the campus list. After the event ends they return to the campus list.

The events page opens the shop in the marketplace, using its existing single-shop cart, pickup slots and DuitNow checkout. No multi-vendor checkout is offered.

## Merchant operations
Manage orders has active, payment-verification, preparing, ready, completed and all filters. It refreshes every 15 seconds while visible; new orders show a five-second notice. This is in-page polling, not background push notifications.

Verify payment in the merchant banking app before accepting an order. A receipt upload alone is not bank confirmation. Mark ready after preparation and mark collected after handover.

Sales count completed orders only. Charts use Malaysian calendar days. These are order totals, not net profit or bank reconciliation.

## Admin visibility
The protected merchant view shows owner contacts, store details, DuitNow QR, menus, pickup capacity and orders with submitted receipt links. Dedicated rental, customer/user and analytics pages remain available. Passwords and authentication secrets are not exposed.

## Deployment
Deploy both frontend and backend together. Merchant order requests now require an owner/admin token; older frontends need updating. No new database schema is introduced. Production enrollment, email and payment testing still require authorized accounts and configured live data.
