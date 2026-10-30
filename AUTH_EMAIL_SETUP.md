# PayNet email verification: deployment guide

## What was fixed

The customer/vendor form was still calling AWS SES, while /register separately used Supabase Auth. Supabase settings did not control the AWS sender. Registration also passed a string instead of JWT claims; password recovery omitted the code; profile updates bypassed email verification.

Both registration URLs now use the same FastAPI flow. Supabase verifies email ownership, then FastAPI creates the PayNet account and issues a PayNet login token. Existing passwords and user IDs are retained. This is an email verification bridge, NOT a full migration of password login to Supabase Auth.

One Supabase Auth identity and one public.users profile per email are expected: they serve different purposes, not two PayNet accounts. Supabase identities can exist before registration finishes. FastAPI creates public.users after successful verification. Inspect any existing auth.users database trigger that also creates public.users: it could conflict with this flow. No new trigger is required.

## 1. Supabase configuration

Use the project that hosts your PayNet database.

1. In project Settings/API, copy the Project URL and publishable key (or legacy anon key). Do NOT use a service_role/secret key.
2. Keep email sign-in, new user signup, and email confirmation enabled.
3. Set email OTP length to 8 and expiry to 600 seconds. The UI accepts 6-8 digits, and PayNet rejects challenges older than 10 minutes.
4. Under Authentication > Emails > Templates, update BOTH Confirm signup and Magic Link. Supabase can use the first for a new identity and the second for an existing one. Use a subject such as `Your Payvolution verification code` and this body:

```html
<h2>Your Payvolution verification code</h2>
<p>Enter this code only on Payvolution to finish the action you requested:</p>
<p style="font-size:28px;letter-spacing:5px"><strong>{{ .Token }}</strong></p>
<p>This code expires in 10 minutes. Never share it with anyone.</p>
<p>If you did not request this, ignore this email.</p>
```

This bridge uses the same email-ownership OTP for registration and password reset. FastAPI binds the pending challenge to the requested action. The Supabase Reset Password template is not used by this implementation. Sending a new code replaces the outstanding challenge for that mailbox.

5. Keep Site URL https://payvolution.app. This flow uses a typed code, not a redirect link.
6. Configure custom SMTP. For temporary Gmail testing, use smtp.gmail.com, port 587, and a Google app password rather than the ordinary account password. Use the authorized mailbox as sender. Never paste credentials into chat or GitHub.
7. Review Authentication > Rate Limits AND the SMTP provider quota. All OTP requests originate from Render, so provider IP limits also matter. Do not disable abuse limits simply to accommodate launch traffic. Production needs delivery/load testing and additional bot protection appropriate to traffic.

Supabase password settings do not enforce PayNet's local password policy. FastAPI now requires at least 12 characters with uppercase, lowercase, a number and a symbol, with a 72-byte bcrypt limit. Existing passwords work until changed. Prefer a long unique password; routine forced changes are not needed without suspected compromise.

## 2. Render settings: BEFORE pushing

Open Render > Payvolution > Environment. Add:

| Key | Value |
| --- | --- |
| SUPABASE_URL | Your project HTTPS URL, e.g. https://PROJECT.supabase.co |
| SUPABASE_PUBLISHABLE_KEY | Publishable key from the same project; alternatively set SUPABASE_ANON_KEY to the legacy anon key |
| SECRET_KEY | Private random signing secret, at least 32 characters; use Generate |
| DATABASE_URL | Retain your working database connection string |

Retain an existing strong SECRET_KEY rather than replacing it unnecessarily. Never put it in a NEXT_PUBLIC variable. The backend now refuses to start without a proper key instead of using a publicly known fallback.

A random signing key was added to your ignored local backend/.env. This does NOT configure Render. Add Supabase URL and public key to that local file for local testing as well. AWS and Resend are no longer used by this OTP flow. No new frontend Supabase environment variables are required.

All existing sessions must log in again after this deployment. Future password resets invalidate previous PayNet tokens. Old pending codes also stop working: request a new code after deployment.

## 3. Review and deploy

Review `git diff`, commit the auth changes, this guide, and the tests. Do not stage backend/.env. Push only after configuring Render and the Supabase templates. Check that both Render and Vercel deploy the same new commit.

Checks:

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s backend -p test_auth_verification.py -v
npm --prefix frontend run build
```

Tests are offline mocks, not proof of SMTP delivery or PostgreSQL concurrency. No production account, email, or database was modified by tests.

## 4. Live verification

Use an email address you control.

1. Open /register, select Customer, fill in a strong password, and Send Code.
2. Check inbox/spam, enter the latest code, and confirm login works.
3. Try the same email with different capitalization; it must not create another PayNet account.
4. Use /forgot-password: request a code, then submit it with a new strong password. The old password must fail and the new one must work. An older browser session must require login again.
5. Missing, wrong, expired and reused codes must fail. Resending within 60 seconds must fail; five wrong attempts block the challenge.
6. Confirm merchant registration creates a store profile; pop-up registration opens the rental flow.

Do not delete real accounts or orders to test. Historical duplicate accounts are not merged by this change. Email verification proves control of an inbox, not one human per account. One student per account needs a campus identity/student-ID policy, potentially a future Microsoft 365 integration.

## Troubleshooting

| Error | Check |
| --- | --- |
| Email verification is not configured / 503 | Render SUPABASE_URL and publishable/anon key |
| Startup error mentions SECRET_KEY | Add a random private signing key of at least 32 characters |
| 502 with provider HTTP 500 in Render logs | Supabase Auth logs: SMTP app password, sender rejection, or failing auth.users trigger |
| Provider 401/403 | Wrong project/key or provider configuration; inspect Supabase Auth logs |
| 429 | Resend cooldown, Supabase quota, or SMTP provider quota |
| Email contains only a link | Put {{ .Token }} in both Confirm signup and Magic Link templates |
| Code rejected | Same email/action, latest code, under 10 minutes; request fresh code after deployment |
| 422 | Invalid/missing fields in the failed API request |

Share only error codes/messages from logs; hide addresses, OTPs, passwords, tokens and database URLs.

## Capacity: 300-1,000 emails/day

Supabase's built-in sender is restricted to project-team recipients and currently two emails/hour. Custom SMTP is required for public production email. Its configured rate limit and the SMTP provider's limits both apply.

Personal Gmail may stop above 500 emails/day. Brevo Free offers 300/day, insufficient for your stated peak and resends. For production, use a transactional SMTP plan sized for actual monthly volume (up to 30,000/month if sending 1,000 every day), or ask campus IT for an approved service under an existing university agreement. A student Microsoft 365 account alone does not authorize bulk application email. No paid service was purchased or enabled.

Sources:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://support.google.com/mail/answer/22839
- https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans

This is an auth-flow repair, not a full payment-application security audit. Live delivery, provider settings, database concurrency and launch load still need verification.
