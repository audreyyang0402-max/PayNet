# PayNet

Campus food pre-ordering for the Payvolution cashless campus campaign. Customers order from a stall, pay by DuitNow QR, upload their transfer receipt, and collect at a pickup time. Vendors check the receipt in their banking app, then accept or reject the order.

## How an order moves

```
draft ──(customer uploads receipt)──► pending_verification ──► preparing ──► ready ──► completed
  │                                         │
  └─ unpaid for 15 min → cancelled          └─ vendor rejects → rejected (pickup place freed)
```

Vendors can only make the moves shown. "Ready" emails the customer their pickup time in Malaysia time.

## Roles

| Role | Can |
|---|---|
| Customer | Order, pay, upload receipts, see own orders |
| Merchant | Manage own stall: menu, pickup slots, DuitNow QR, incoming orders |
| Admin | Assign roles, show or hide stalls, manage events, view analytics |

Everyone signs up as a customer at `/vendor/register` (email code). An admin assigns the merchant role.

## Code layout

| Folder | What |
|---|---|
| `backend/` | FastAPI + SQLAlchemy (async). `main.py` holds the routes, `models.py` the tables. |
| `frontend/` | Next.js app. `src/app/` pages, `src/components/` shared parts. |

## Docs

- [`DEPLOYMENT.md`](DEPLOYMENT.md): set up Supabase, Render and Vercel from scratch
- [`SCHEMA.sql`](SCHEMA.sql): tables and storage buckets for a new database
- [`AUTH_EMAIL_SETUP.md`](AUTH_EMAIL_SETUP.md): email verification codes
- [`backend/.env.example`](backend/.env.example): backend settings

## Run locally

```bash
cd backend && pip install -r requirements.txt && cp .env.example .env   # fill in .env
uvicorn main:app --reload --port 8000
cd frontend && npm install && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```
