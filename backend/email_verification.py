"""Supabase email OTP bridge for existing PayNet password accounts.

Supabase verifies mailbox ownership; only PayNet issues application JWTs.
No OTPs, provider sessions, or passwords are logged or returned to the browser.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
import httpx
from fastapi import HTTPException
from sqlalchemy import delete, select, text
from models import EmailVerification

logger = logging.getLogger(__name__)
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
PROVIDER_MARKER = "supabase-email-otp-v1"

def normalize_email(email):
    return email.strip().lower()

async def lock_email(db, email):
    # Transaction-scoped PostgreSQL lock also serializes requests across workers.
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:email, 0))"), {"email": normalize_email(email)})

async def provider_request(path, payload):
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url.startswith("https://") or not key:
        logger.error("Email verification configuration missing: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY")
        raise HTTPException(503, "Email verification is not configured. Please contact support.")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{url}/auth/v1/{path}", headers={"apikey": key}, json=payload)
    except httpx.RequestError:
        logger.warning("Supabase Auth connection failed")
        raise HTTPException(503, "Email service is temporarily unavailable. Please try again later.") from None
    if response.is_error:
        # Never log provider bodies: they may contain addresses or other private data.
        logger.warning("Supabase Auth %s returned HTTP %s", path, response.status_code)
        if response.status_code == 429:
            raise HTTPException(429, "Too many email requests. Please wait before trying again.")
        if path == "verify" and response.status_code in (400, 401, 403, 422):
            raise HTTPException(400, "Invalid or expired verification code.")
        raise HTTPException(502, "Could not send or verify the email. Please contact support if this continues.")
    return response.json()

async def issue_code(db, email, purpose):
    email = normalize_email(email)
    if purpose not in ("register", "reset", "delete"):
        raise HTTPException(400, "Invalid verification purpose.")
    await lock_email(db, email)
    now = datetime.now(timezone.utc)
    existing = (await db.execute(select(EmailVerification).where(EmailVerification.email == email).order_by(EmailVerification.created_at.desc()))).scalars().first()
    if existing and now - existing.created_at < timedelta(seconds=60):
        raise HTTPException(429, "Please wait 60 seconds before requesting another code.")
    # One outstanding purpose per mailbox; Supabase has one email OTP per mailbox.
    await provider_request("otp", {"email": email, "create_user": True})
    await db.execute(delete(EmailVerification).where(EmailVerification.email == email))
    db.add(EmailVerification(email=email, purpose=purpose, code_hash=PROVIDER_MARKER,
                             attempts=0, expires_at=now + CODE_TTL, created_at=now))
    await db.commit()

async def check_code(db, email, purpose, code):
    email = normalize_email(email)
    await lock_email(db, email)
    record = (await db.execute(select(EmailVerification).where(EmailVerification.email == email, EmailVerification.purpose == purpose).with_for_update())).scalars().first()
    if not record or record.code_hash != PROVIDER_MARKER or record.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired verification code. Please request a new code.")
    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(429, "Too many incorrect attempts. Please request a new code.")
    try:
        if not code.isascii() or not code.isdigit() or not 6 <= len(code) <= 8:
            raise HTTPException(400, "Enter the 6 to 8 digit code from your email.")
        result = await provider_request("verify", {"email": email, "token": code, "type": "email"})
        user = result.get("user") or {}
        if normalize_email(user.get("email", "")) != email or not user.get("email_confirmed_at"):
            raise HTTPException(400, "Email verification failed.")
    except HTTPException as exc:
        if exc.status_code == 400:
            record.attempts += 1
            await db.commit()
        raise
    await db.delete(record)
    # Caller commits consumption together with account creation/password change.
