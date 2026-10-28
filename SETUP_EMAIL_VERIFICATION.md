# Email Verification & Account Deletion Setup Guide

## 📦 What Was Created

### Backend Files
1. **`backend/email_service.py`** - Email handling with Resend
   - Code generation (6-digit)
   - Email sending
   - Expiration management (5 minutes)

2. **`backend/auth_endpoints.py`** - 3 new endpoints
   - `POST /auth/send-verification` - Send verification code
   - `POST /auth/verify-code` - Verify code & complete registration
   - `DELETE /users/me/account` - Soft delete account

### Frontend Files
1. **`frontend/src/app/verify-email/page.tsx`** - Verification page
2. **`frontend/src/components/DeleteAccountButton.tsx`** - Delete account button component

---

## 🔧 Backend Setup (3 Steps)

### Step 1: Install Resend
```bash
pip install resend
```

### Step 2: Add to .env
```
RESEND_API_KEY=re_your_free_api_key_here
```
Get free API key from https://resend.com/

### Step 3: Update Models & Main.py

**A. Update `backend/models.py` - Add fields to User class:**
```python
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="customer")
    email_verified = Column(Boolean, default=False)  # ← ADD THIS
    is_deleted = Column(Boolean, default=False)      # ← ADD THIS
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # ← ADD THIS
    
    rental_bookings = relationship("RentalBooking", back_populates="vendor_user")
    orders = relationship("Order", back_populates="customer")
```

**B. Update `backend/main.py` - Add imports & endpoints:**

At the top of `main.py`, add to imports:
```python
from email_service import send_verification_email, generate_verification_code, hash_code, get_expiration_time
from auth_endpoints import (
    SendVerificationRequest,
    VerifyCodeRequest,
    DeleteAccountRequest,
    send_verification,
    verify_code,
    delete_account,
)
```

Then add these endpoint definitions to your app (copy all code from `auth_endpoints.py` endpoints section):
```python
@app.post("/auth/send-verification")
async def send_verification_endpoint(
    req: SendVerificationRequest,
    db: AsyncSession = Depends(get_db)
):
    return await send_verification(req, db)

@app.post("/auth/verify-code")
async def verify_code_endpoint(
    req: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db)
):
    return await verify_code(req, db)

@app.delete("/users/me/account")
async def delete_account_endpoint(
    req: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await delete_account(req, current_user, db)
```

### Step 4: Run Migration (if using Alembic)
```bash
alembic revision --autogenerate -m "Add email verification and soft delete"
alembic upgrade head
```

Or manually run SQL:
```sql
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL;
```

---

## 🎨 Frontend Integration

### For Registration Flow

In your **signup page** (`frontend/src/app/signup/page.tsx`):

1. When user submits signup form, first send verification code:
```typescript
// After user fills name, email, password
const res = await fetch("http://127.0.0.1:8000/auth/send-verification", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: formData.email,
    purpose: "register",
  }),
});

if (res.ok) {
  // Redirect to verification page with email as query param
  router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`);
}
```

2. The verification page (`/verify-email`) handles entering the code and completing registration.

### For Profile Page

Add the delete button to your profile page:

```typescript
import DeleteAccountButton from "@/components/DeleteAccountButton";

export default function ProfilePage() {
  return (
    <div>
      {/* ... existing profile content ... */}
      
      <div className="mt-8 pt-8 border-t border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Danger Zone</h3>
        <DeleteAccountButton />
      </div>
    </div>
  );
}
```

---

## 📋 Flow Summary

### Registration with Email Verification
1. User enters email, password, name on signup page
2. System sends 6-digit code to their email via Resend
3. User redirected to verification page
4. User enters code
5. Code verified, account created, user logged in automatically
6. User redirected to home page

### Account Deletion
1. User clicks "Delete My Account" in profile
2. Confirmation dialog shows
3. User enters password
4. Account soft-deleted (`is_deleted = true`)
5. Order history preserved
6. User logged out and redirected to login

---

## 🧪 Testing

### Test Email Verification
```bash
# 1. Send verification code
curl -X POST http://127.0.0.1:8000/auth/send-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "purpose": "register"
  }'

# 2. Verify code (check your Resend inbox for the code)
curl -X POST http://127.0.0.1:8000/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456",
    "purpose": "register",
    "name": "Test User",
    "password": "SecurePassword123!",
    "phone_number": "+601234567890"
  }'
```

### Test Account Deletion
```bash
curl -X DELETE http://127.0.0.1:8000/users/me/account \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "password": "SecurePassword123!"
  }'
```

---

## ✅ Key Features

✅ Email verification required on signup (5-minute expiration)
✅ Soft delete preserves order history
✅ Admins cannot delete their accounts
✅ Admins can see deleted accounts
✅ Free tier with Resend (3,000 emails/month)
✅ Secure code hashing (SHA-256)
✅ Max 5 verification attempts

---

## 🚀 Next Steps

1. Install Resend: `pip install resend`
2. Get free API key from https://resend.com/
3. Add to .env file
4. Update models.py with new fields
5. Copy endpoints to main.py
6. Run database migration
7. Update signup page to call send-verification
8. Add DeleteAccountButton to profile page
9. Test the flow!
