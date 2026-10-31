"""
Transactional email delivery for PayNet / Sunway Express Lane.
Uses Resend (resend.com) — free tier: 3,000 emails/month.
"""
import os
import logging
import resend

logger = logging.getLogger(__name__)

# Resend is configured via env var RESEND_API_KEY
resend.api_key = os.getenv("RESEND_API_KEY", "")

# The verified sender address in your Resend account
SENDER = os.getenv("EMAIL_FROM", "Sunway Express Lane <orders@payvolution.app>")


def _currency(amount) -> str:
    return f"RM {float(amount):.2f}"


def send_order_ready_email(
    customer_email: str,
    customer_name: str,
    order_number: str,
    merchant_name: str,
    merchant_location: str,
    pickup_time: str,
    items: list[dict],   # [{"name": str, "quantity": int, "price": float}]
    total_price: float,
) -> bool:
    """
    Send a 'Your food is ready!' email to the customer.
    Returns True on success, False on failure (so the order update still succeeds).
    """
    if not resend.api_key:
        logger.error("RESEND_API_KEY is not set — order-ready email skipped.")
        return False

    # Build item rows for the email
    item_rows = "".join(
        f"""
        <tr>
          <td style="padding:6px 0;color:#1e293b;">{i['name']}</td>
          <td style="padding:6px 0;text-align:center;color:#64748b;">x{i['quantity']}</td>
          <td style="padding:6px 0;text-align:right;color:#1e293b;">{_currency(float(i['price']) * i['quantity'])}</td>
        </tr>"""
        for i in items
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#F04B14,#f97316);padding:32px 40px;text-align:center;">
                <p style="margin:0 0 6px;font-size:13px;color:#fde8d6;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Sunway Express Lane</p>
                <h1 style="margin:0;font-size:28px;color:#ffffff;font-weight:800;">Your food is ready! 🍽️</h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 20px;font-size:15px;color:#475569;">
                  Hi <strong>{customer_name}</strong>,<br><br>
                  Great news — your order from <strong>{merchant_name}</strong> is ready for pickup!
                  Please collect it within <strong>10 minutes</strong> to avoid your slot expiring.
                </p>

                <!-- Order Details Box -->
                <table width="100%" cellpadding="0" cellspacing="0"
                  style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
                  <tr>
                    <td>
                      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#ea580c;text-transform:uppercase;letter-spacing:1px;">Order Details</p>
                      <p style="margin:0 0 12px;font-size:20px;font-weight:800;color:#1e293b;">{order_number}</p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #fdba74;padding-top:12px;">
                        {item_rows}
                        <tr>
                          <td colspan="3" style="padding-top:10px;border-top:1px solid #fdba74;">
                            <table width="100%"><tr>
                              <td style="font-weight:700;color:#1e293b;font-size:15px;">Total</td>
                              <td style="text-align:right;font-weight:800;color:#F04B14;font-size:18px;">{_currency(total_price)}</td>
                            </tr></table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Pickup Info -->
                <table width="100%" cellpadding="0" cellspacing="0"
                  style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:18px 24px;margin-bottom:24px;">
                  <tr>
                    <td>
                      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">Pickup Info</p>
                      <p style="margin:0 0 4px;font-size:14px;color:#1e293b;">📍 <strong>{merchant_location}</strong></p>
                      <p style="margin:0;font-size:14px;color:#1e293b;">🕐 Slot: <strong>{pickup_time}</strong></p>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
                  If you have any issues, please approach the stall directly.<br>
                  Thank you for ordering with Sunway Express Lane! 🧡
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;color:#94a3b8;">
                  © 2026 Payvolution · Sunway University Campus · payvolution.app
                </p>
              </td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
    """

    try:
        resend.Emails.send({
            "from": SENDER,
            "to": [customer_email],
            "subject": f"🍽️ Your order {order_number} is ready for pickup!",
            "html": html,
        })
        logger.info("Order-ready email sent to %s for order %s", customer_email, order_number)
        return True
    except Exception as exc:
        logger.error("Failed to send order-ready email to %s: %s", customer_email, exc)
        return False


# Keep old stubs so any other import doesn't break
def generate_verification_code(): pass
def hash_code(code): pass
def get_expiration_time(): pass
