"""
Telegram notifications for PayNet.

How it works:
1. A logged-in customer taps "Connect Telegram" -> backend gives them a
   t.me deep link containing a short signed token.
2. The customer opens the link and presses START in Telegram.
3. Telegram calls our /webhooks/telegram endpoint with that token; we verify it
   and save the customer's Telegram chat_id on their user row.
4. When a merchant marks an order "ready", we send a message to that chat_id.

Environment variables (backend/.env):
    TELEGRAM_BOT_TOKEN       token from @BotFather
    TELEGRAM_BOT_USERNAME    bot username WITHOUT the @
    TELEGRAM_WEBHOOK_SECRET  any random string (letters, digits, _ and - only)
"""
import os
import hmac
import time
import base64
import hashlib
from html import escape
from uuid import UUID

import httpx

from auth import SECRET_KEY

TELEGRAM_API = "https://api.telegram.org"
LINK_TOKEN_TTL_SECONDS = 15 * 60  # the "Connect Telegram" link is valid for 15 minutes


# Read env vars lazily so it doesn't matter when load_dotenv() runs.
def bot_token() -> str | None:
    return os.getenv("TELEGRAM_BOT_TOKEN")


def bot_username() -> str | None:
    return os.getenv("TELEGRAM_BOT_USERNAME")


def webhook_secret() -> str | None:
    return os.getenv("TELEGRAM_WEBHOOK_SECRET")


# --- LINK TOKEN -------------------------------------------------------------
# Telegram only allows 64 chars of [A-Za-z0-9_-] in the /start payload, so a
# normal JWT is too long. Instead we pack: user_id (16 bytes) + expiry (4 bytes)
# + truncated HMAC signature (16 bytes) = 36 bytes -> 48 base64url characters.
# This is NOT a login token, so it can never be used to call the API.

def _sign(payload: bytes) -> bytes:
    return hmac.new(SECRET_KEY.encode(), payload, hashlib.sha256).digest()[:16]


def create_link_token(user_id: UUID) -> str:
    expires_at = int(time.time()) + LINK_TOKEN_TTL_SECONDS
    payload = user_id.bytes + expires_at.to_bytes(4, "big")
    return base64.urlsafe_b64encode(payload + _sign(payload)).rstrip(b"=").decode()


def verify_link_token(token: str) -> UUID | None:
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    except Exception:
        return None
    if len(raw) != 36:
        return None
    payload, signature = raw[:20], raw[20:]
    if not hmac.compare_digest(signature, _sign(payload)):
        return None
    if int.from_bytes(payload[16:], "big") < time.time():
        return None
    return UUID(bytes=payload[:16])


# --- SENDING ----------------------------------------------------------------

async def send_telegram_message(chat_id: str | int, text: str) -> bool:
    """Send an HTML-formatted message. Never raises: a failed notification
    must not break the merchant's status update."""
    token = bot_token()
    if not token:
        print("[telegram] TELEGRAM_BOT_TOKEN is not set - skipping message")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{TELEGRAM_API}/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
        if response.status_code != 200:
            print(f"[telegram] sendMessage failed: {response.status_code} {response.text}")
            return False
        return True
    except httpx.HTTPError as exc:
        print(f"[telegram] sendMessage error: {exc}")
        return False


async def notify_order_ready(chat_id: str, store_name: str, order_id: UUID) -> bool:
    short_id = str(order_id)[:8]
    text = (
        "🔔 <b>Your order is ready!</b>\n\n"
        f"Order <b>#{short_id}</b> from <b>{escape(store_name)}</b> is ready for pickup. "
        "Head over to the stall to collect it 🍽️"
    )
    return await send_telegram_message(chat_id, text)
