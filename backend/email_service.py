# backend/email_service.py
import os
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
import resend

# Initialize Resend
resend.api_key = os.getenv("RESEND_API_KEY", "")

def generate_verification_code() -> str:
    """Generate a secure 6-digit code"""
    return "".join([str(secrets.randbelow(10)) for _ in range(6)])

def hash_code(code: str) -> str:
    """Hash the verification code for secure storage"""
    return hashlib.sha256(code.encode()).hexdigest()

async def send_verification_email(to_email: str, code: str, purpose: str = "register") -> bool:
    """
    Send verification email via Resend
    
    Args:
        to_email: Recipient email
        code: 6-digit verification code
        purpose: "register" or "reset"
    
    Returns:
        True if sent successfully, False otherwise
    """
    try:
        subject = "Verify Your Email - PayNet" if purpose == "register" else "Reset Your Password - PayNet"
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
          <div style="background-color: white; padding: 30px; border-radius: 8px; text-align: center;">
            <h2 style="color: #333; margin-bottom: 20px;">PayNet Account Verification</h2>
            <p style="color: #666; margin-bottom: 20px;">
              {"Welcome! Please verify your email to complete registration." if purpose == "register" else "Click the code below to reset your password."}
            </p>
            <div style="background-color: #637AE4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h1 style="color: white; letter-spacing: 4px; margin: 0; font-size: 36px;">{code}</h1>
            </div>
            <p style="color: #999; font-size: 14px; margin-top: 20px;">This code will expire in 5 minutes.</p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
          </div>
        </div>
        """
        
        params = {
            "from": "onboarding@resend.dev",  # Use test email during development
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        
        response = resend.Emails.send(params)
        return True
    except Exception as e:
        print(f"Failed to send verification email to {to_email}: {e}")
        return False

def get_expiration_time() -> datetime:
    """Get expiration time (5 minutes from now in UTC)"""
    return datetime.now(timezone.utc) + timedelta(minutes=5)
