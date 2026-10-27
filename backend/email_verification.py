"""
Email verification (one-time codes) for PayNet.

Flow:
1. Frontend asks POST /auth/send-code with an email + purpose ("register" or "reset").
2. issue_code() creates a random 6-digit code, stores only its HASH with a 10-minute
   expiry, and send_verification_email() mails the plain code to the user.
3. The user types the code; the register / reset endpoint calls check_code(), which
   verifies it, limits wrong guesses, and deletes the code so it works only once.

Environment variables (backend/.env) for sending real emails (Gmail example):
    SMTP_HOST=smtp.gmail.com        (optional, default shown)
    SMTP_PORT=587                   (optional, default shown)
    SMTP_USER=youraddress@gmail.com
    SMTP_PASSWORD=your-16-char-app-password
    SMTP_FROM=PayNet <youraddress@gmail.com>   (optional)

If SMTP_USER / SMTP_PASSWORD are not set, the code is printed in the backend
terminal instead, which is handy while developing.
"""
import os
import hmac
import hashlib
import secrets
import asyncio
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from auth import SECRET_KEY
from models import EmailVerification

CODE_TTL = timedelta(minutes=10)         # how long a code stays valid
RESEND_COOLDOWN = timedelta(seconds=60)  # minimum gap between codes for one email
MAX_ATTEMPTS = 5                         # wrong guesses allowed per code


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_code(email: str, purpose: str, code: str) -> str:
    # Keyed hash: a leaked database row can't be reversed without SECRET_KEY.
    message = f"{email}:{purpose}:{code}".encode()
    return hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"  # cryptographically secure, 000000-999999


async def _latest_record(db: AsyncSession, email: str, purpose: str):
    result = await db.execute(
        select(EmailVerification)
        .where(EmailVerification.email == email, EmailVerification.purpose == purpose)
        .order_by(EmailVerification.created_at.desc())
    )
    return result.scalars().first()


async def issue_code(db: AsyncSession, email: str, purpose: str) -> str:
    """Create and store a new code (replacing any older one). Returns the plain code."""
    email = normalize_email(email)
    now = datetime.now(timezone.utc)

    existing = await _latest_record(db, email, purpose)
    if existing and existing.created_at and now - existing.created_at < RESEND_COOLDOWN:
        wait = int((RESEND_COOLDOWN - (now - existing.created_at)).total_seconds()) + 1
        raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before requesting another code.")

    await db.execute(
        delete(EmailVerification).where(
            EmailVerification.email == email, EmailVerification.purpose == purpose
        )
    )
    code = _generate_code()
    db.add(EmailVerification(
        email=email,
        purpose=purpose,
        code_hash=_hash_code(email, purpose, code),
        expires_at=now + CODE_TTL,
    ))
    await db.commit()
    return code


async def check_code(db: AsyncSession, email: str, purpose: str, code: str) -> None:
    """Raise HTTP 400 unless `code` is the valid, unexpired code for this email + purpose.
    On success the code is deleted so it can't be reused."""
    email = normalize_email(email)
    now = datetime.now(timezone.utc)
    invalid = HTTPException(status_code=400, detail="Invalid or expired verification code.")

    record = await _latest_record(db, email, purpose)
    if record is None:
        raise invalid
    if record.expires_at < now:
        await db.delete(record)
        await db.commit()
        raise invalid
    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")

    if not hmac.compare_digest(record.code_hash, _hash_code(email, purpose, code.strip())):
        record.attempts += 1
        await db.commit()  # persist the failed attempt even though we raise below
        raise invalid

    await db.delete(record)
    await db.commit()


# --- SENDING EMAIL ----------------------------------------------------------

def _send_sync(to: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")

    message = EmailMessage()
    message["From"] = os.getenv("SMTP_FROM", user)
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(message)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send an email without blocking the server. Returns False if sending failed."""
    if not os.getenv("SMTP_USER") or not os.getenv("SMTP_PASSWORD"):
        print(f"\n[DEV EMAIL - SMTP not configured]\nTo: {to}\nSubject: {subject}\n{body}\n")
        return True
    try:
        await asyncio.to_thread(_send_sync, to, subject, body)
        return True
    except Exception as exc:
        print(f"[email] failed to send to {to}: {exc}")
        return False


async def send_verification_email(to: str, code: str, purpose: str) -> bool:
    action = "reset your password" if purpose == "reset" else "create your account"
    body = (
        f"Your PayNet verification code is: {code}\n\n"
        f"Enter this code to {action}. It expires in 10 minutes.\n"
        "If you didn't request this, you can safely ignore this email."
    )
    return await send_email(to, "Your PayNet verification code", body)
