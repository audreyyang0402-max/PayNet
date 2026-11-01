# Deploying PayNet from scratch

How to run your own copy on Supabase (database, storage, email codes), Render (backend) and Vercel (frontend). These steps were followed end to end on a fresh deployment in November 2026.

Do the steps in order. The backend needs the database tables before it starts, and the frontend needs the backend's URL.

## 1. Supabase

1. Create a project. Note the database password; use letters and digits only, because symbols need URL-encoding in step 2.
2. **SQL Editor:** paste [`SCHEMA.sql`](SCHEMA.sql) and run it once. It creates the 10 tables and both storage buckets.
3. **Storage:** check there are two buckets:
   - `uploads`: **public**. QR codes, menu photos, event banners.
   - `receipts`: **private**. Payment receipts. Receipt upload fails with "Could not store the image" if this bucket is missing.
4. **Authentication → Emails → SMTP Settings:** turn on custom SMTP. Supabase's built-in sender only reaches project team members, about 2 emails an hour, so sign-up codes won't reach anyone else without it.
   - Gmail: host `smtp.gmail.com`, port `465`, **username = the full Gmail address**, password = a Google *app password* (needs 2-Step Verification on). A wrong username gives `535 BadCredentials` in the Auth logs.
5. **Authentication → Emails → Templates:** the sign-up and magic-link templates must contain `{{ .Token }}` so the email shows a code. Wording and OTP settings: [`AUTH_EMAIL_SETUP.md`](AUTH_EMAIL_SETUP.md).
6. Collect for step 2:
   - **Connect → Session pooler** connection string (port 5432).
   - **Settings → API:** Project URL, publishable key, secret key.

## 2. Render (backend)

New **Web Service** from the repo:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

Environment variables (see [`backend/.env.example`](backend/.env.example)):

| Key | Value |
|---|---|
| `PYTHON_VERSION` | `3.13.4` (Render's default, 3.14, fails to install some packages) |
| `DATABASE_URL` | Session pooler string with your password filled in, no `[ ]` brackets |
| `SECRET_KEY` | Random, 32+ characters: `python -c "import secrets; print(secrets.token_urlsafe(48))"`. **Not** the Supabase key. |
| `SUPABASE_URL` | `https://<project>.supabase.co`, with nothing after `.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key (sends and checks email codes) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (uploads images). Backend only. |
| `SMTP_USER`, `SMTP_PASSWORD` | Gmail address and app password for "your food is ready" emails |

Check: `https://<service>.onrender.com/merchants` returns `[]`.

Common failures:
- "No open ports detected": the Start Command is wrong, often set to the pip install line.
- `InvalidPasswordError`: the password in `DATABASE_URL` is wrong. Reset it in Supabase and update the variable.
- Render's **free plan blocks outgoing email** (ports 25, 465, 587). Marking an order ready still works, but the email is not sent. Use a paid instance, or an email API over HTTPS.

## 3. Vercel (frontend)

New project from the repo, **Root Directory** `frontend`.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Render URL, e.g. `https://<service>.onrender.com`. Without it, production calls `https://payvolution.onrender.com`. |

To deploy a branch other than `main`: **Settings → Environments → Production → Branch Tracking**. The branch needs at least one deployment first, so push a commit to it.

## 4. Allow the frontend to call the backend (CORS)

The backend only accepts browser requests from the sites listed in `allow_origins` in `backend/main.py`. Add your Vercel URL there, e.g. `"https://your-app.vercel.app",`, and redeploy Render. Otherwise every page loads without data and the browser console shows CORS errors.

## 5. First admin

Sign up at `/vendor/register`, then in Supabase → SQL Editor:

```sql
update users set role = 'admin' where lower(trim(email)) = lower(trim('you@example.com')) returning email, role;
```

Log out and in again. Admins land on `/admin/users`, where they give other accounts the merchant role. New stalls start **hidden**; open the stall under **Vendors** and click **Hidden from Customers** to make it live.

## 6. Smoke test

1. Vendor: upload a DuitNow QR, add a menu item, add a pickup slot for tomorrow.
2. Customer: order, upload a receipt. The order shows *pending verification*.
3. Vendor: Verify & Accept → Mark Ready → Mark Collected. Reject on another order frees its pickup place.
4. Without logging in, `GET /orders/<id>` returns 401.
