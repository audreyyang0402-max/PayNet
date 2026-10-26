"""
One-time helper: tell Telegram where to send bot messages.

Usage (backend running + ngrok running):
    python register_telegram_webhook.py https://your-ngrok-url.ngrok-free.dev

Re-run it whenever your public (ngrok) URL changes.
"""
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

token = os.getenv("TELEGRAM_BOT_TOKEN")
secret = os.getenv("TELEGRAM_WEBHOOK_SECRET")

if not token or not secret:
    sys.exit("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in backend/.env first.")
if len(sys.argv) != 2:
    sys.exit("Usage: python register_telegram_webhook.py https://your-public-url")

public_url = sys.argv[1].rstrip("/")

response = httpx.post(
    f"https://api.telegram.org/bot{token}/setWebhook",
    json={
        "url": f"{public_url}/webhooks/telegram",
        "secret_token": secret,
        "allowed_updates": ["message"],
    },
    timeout=15,
)
print(response.json())
