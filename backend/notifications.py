import os
import hmac
import hashlib
import time
from datetime import datetime, timezone
import httpx
from fastapi import HTTPException

# Environment variable getters for Telegram configuration
def bot_token() -> str:
    return os.getenv("TELEGRAM_BOT_TOKEN", "")

def bot_username() -> str:
    return os.getenv("TELEGRAM_BOT_USERNAME", "")

def webhook_secret() -> str:
    return os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

# Link Token TTL (e.g., 15 minutes to link Telegram account)
LINK_TOKEN_TTL_SECONDS = 900

def create_link_token(user_id) -> str:
    """Generates a secure timestamped token to link a user's Telegram chat ID."""
    secret = webhook_secret() or "default-secret"
    payload = f"{user_id}:{int(time.time())}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"

def verify_link_token(token: str):
    """Verifies the Telegram linking token and ensures it hasn't expired."""
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return None
        user_id_str, timestamp_str, signature = parts
        payload = f"{user_id_str}:{timestamp_str}"
        
        secret = webhook_secret() or "default-secret"
        expected_sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            return None
            
        timestamp = int(timestamp_str)
        if time.time() - timestamp > LINK_TOKEN_TTL_SECONDS:
            return None # Expired
            
        return user_id_str
    except Exception:
        return None

async def send_telegram_message(chat_id: str | int, text: str):
    """Sends a message via the Telegram Bot API."""
    token = bot_token()
    if not token:
        print("Telegram bot token not configured.")
        return False
        
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML"
            })
            return response.status_code == 200
        except Exception as e:
            print(f"Failed to send Telegram message: {e}")
            return False

async def notify_order_ready(chat_id: str | int, merchant_name: str, order_id):
    """Convenience helper to alert a customer that their order is ready for pickup."""
    short_id = str(order_id)[:8]
    message = (
        f"🚨 <b>Order Ready for Pickup!</b>\n\n"
        f"Good news! Your order from <b>{merchant_name}</b> (ID: #{short_id}) is now ready.\n\n"
        f"Head over to the stall to collect your food!"
    )
    await send_telegram_message(chat_id, message)