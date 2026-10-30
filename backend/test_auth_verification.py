"""Offline regression tests: no live database or emails are used."""
import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from pydantic import ValidationError
import email_verification as otp
import auth_endpoints as endpoints
import auth

EMAIL = "student@example.edu"
PASSWORD = "Correct-Horse42!"

def database(record=None):
    db = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = record
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    return db

def challenge(**overrides):
    values = dict(email=EMAIL, purpose="reset", code_hash=otp.PROVIDER_MARKER, attempts=0,
                  expires_at=datetime.now(timezone.utc)+timedelta(minutes=10),
                  created_at=datetime.now(timezone.utc)-timedelta(minutes=2))
    values.update(overrides)
    return SimpleNamespace(**values)

class VerificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_challenge_never_calls_provider(self):
        with patch.object(otp, "provider_request", new_callable=AsyncMock) as provider:
            with self.assertRaises(HTTPException): await otp.check_code(database(), EMAIL, "reset", "12345678")
            provider.assert_not_awaited()

    async def test_expired_locked_and_legacy_challenges_rejected(self):
        records = [challenge(expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)),
                   challenge(attempts=5), challenge(code_hash="legacy-code")]
        for record in records:
            with patch.object(otp, "provider_request", new_callable=AsyncMock) as provider:
                with self.assertRaises(HTTPException): await otp.check_code(database(record), EMAIL, "reset", "12345678")
                provider.assert_not_awaited()

    async def test_failed_guess_persisted(self):
        row=challenge(); db=database(row)
        with patch.object(otp, "provider_request", new=AsyncMock(side_effect=HTTPException(400,"Invalid"))):
            with self.assertRaises(HTTPException): await otp.check_code(db,EMAIL,"reset","12345678")
        self.assertEqual(row.attempts,1); db.commit.assert_awaited_once(); db.delete.assert_not_awaited()

    async def test_provider_outage_does_not_count_as_wrong_guess(self):
        row=challenge(); db=database(row)
        with patch.object(otp,"provider_request",new=AsyncMock(side_effect=HTTPException(503,"Unavailable"))):
            with self.assertRaises(HTTPException): await otp.check_code(db,EMAIL,"reset","12345678")
        self.assertEqual(row.attempts,0); db.delete.assert_not_awaited()

    async def test_success_consumed_in_callers_transaction(self):
        db=database(challenge())
        with patch.object(otp,"provider_request",new=AsyncMock(return_value={"user":{"email":EMAIL,"email_confirmed_at":"now"}})) as provider:
            await otp.check_code(db,EMAIL,"reset","12345678")
            provider.assert_awaited_once_with("verify",{"email":EMAIL,"token":"12345678","type":"email"})
        db.delete.assert_awaited_once(); db.commit.assert_not_awaited()

    async def test_wrong_mailbox_rejected(self):
        db=database(challenge())
        with patch.object(otp,"provider_request",new=AsyncMock(return_value={"user":{"email":"other@example.edu","email_confirmed_at":"now"}})):
            with self.assertRaises(HTTPException): await otp.check_code(db,EMAIL,"reset","12345678")
        db.delete.assert_not_awaited()

    async def test_resend_cooldown(self):
        db=database(challenge(created_at=datetime.now(timezone.utc)))
        with patch.object(otp,"provider_request",new_callable=AsyncMock) as provider:
            with self.assertRaises(HTTPException) as error: await otp.issue_code(db,EMAIL,"reset")
            self.assertEqual(error.exception.status_code,429); provider.assert_not_awaited()

    async def test_delivery_failure_does_not_store_challenge(self):
        db=database()
        with patch.object(otp,"provider_request",new=AsyncMock(side_effect=HTTPException(502,"Failure"))):
            with self.assertRaises(HTTPException): await otp.issue_code(db,EMAIL,"register")
        db.add.assert_not_called(); db.commit.assert_not_awaited()

    async def test_unknown_reset_email_does_not_send(self):
        with patch.object(endpoints,"find_user",new=AsyncMock(return_value=None)), patch.object(endpoints,"issue_code",new_callable=AsyncMock) as issue:
            result=await endpoints.send_verification(endpoints.SendVerificationRequest(email=EMAIL,purpose="reset"),database())
            self.assertIn("If",result["message"]); issue.assert_not_awaited()

    async def test_reset_changes_hash_after_verification(self):
        user=SimpleNamespace(password_hash="old",is_deleted=False,email_verified=True)
        with patch.object(endpoints,"find_user",new=AsyncMock(return_value=user)),patch.object(endpoints,"check_code",new_callable=AsyncMock) as check:
            await endpoints.verify_code(endpoints.VerifyCodeRequest(email=EMAIL,purpose="reset",code="12345678",password=PASSWORD),database())
            check.assert_awaited_once()
        self.assertTrue(auth.verify_password(PASSWORD,user.password_hash))
        self.assertNotEqual(auth.password_stamp("old"),auth.password_stamp(user.password_hash))

    async def test_invalid_code_cannot_change_password(self):
        with patch.object(endpoints,"check_code",new=AsyncMock(side_effect=HTTPException(400,"Invalid"))),patch.object(endpoints,"find_user",new_callable=AsyncMock) as find:
            with self.assertRaises(HTTPException):
                await endpoints.verify_code(endpoints.VerifyCodeRequest(email=EMAIL,purpose="reset",code="00000000",password=PASSWORD),database())
            find.assert_not_awaited()

    async def test_old_and_pre_reset_tokens_rejected(self):
        user=SimpleNamespace(id="id",is_deleted=False,email=EMAIL,password_hash="new-hash")
        for claims in [{"sub":"id"},{"sub":"id","pwd":auth.password_stamp("old-hash")}]:
            with self.assertRaises(HTTPException): await auth.get_current_user(auth.create_access_token(claims),database(user))
        result=await auth.get_current_user(auth.create_access_token({"sub":"id","pwd":auth.password_stamp("new-hash")}),database(user))
        self.assertIs(result,user)

    async def test_missing_provider_config_fails_closed(self):
        with patch.dict(os.environ,{"SUPABASE_URL":"","SUPABASE_PUBLISHABLE_KEY":"","SUPABASE_ANON_KEY":""}):
            with self.assertRaises(HTTPException) as error: await otp.provider_request("otp",{"email":EMAIL})
            self.assertEqual(error.exception.status_code,503)

class RegistrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_registration_creates_profile_and_valid_app_token(self):
        from jose import jwt
        from models import User, Merchant
        db=database()
        def add(record):
            if isinstance(record,User): record.id="00000000-0000-0000-0000-000000000001"
        db.add.side_effect=add
        with patch.object(endpoints,"find_user",new=AsyncMock(return_value=None)), patch.object(endpoints,"check_code",new_callable=AsyncMock):
            result=await endpoints.verify_code(endpoints.VerifyCodeRequest(email=EMAIL,code="12345678",password=PASSWORD,name="Student",account_type="merchant",store_name="Cafe"),db)
        claims=jwt.decode(result["access_token"],auth.SECRET_KEY,algorithms=[auth.ALGORITHM])
        self.assertEqual(claims["sub"],result["user_id"])
        self.assertEqual(claims["role"],"merchant")
        self.assertIn("pwd",claims)
        self.assertTrue(any(isinstance(c.args[0],Merchant) for c in db.add.call_args_list))
        db.commit.assert_awaited_once()

    async def test_profile_password_bypass_blocked(self):
        import main
        user=SimpleNamespace(email=EMAIL,password_hash="old")
        for endpoint,model in [(main.update_my_profile,main.UserUpdate)]:
            with self.assertRaises(HTTPException):
                await endpoint(model(password=PASSWORD),database(),user)
        self.assertEqual(user.password_hash,"old")

class ValidationTests(unittest.TestCase):
    def test_email_normalization(self):
        self.assertEqual(endpoints.SendVerificationRequest(email="  STUDENT@example.edu ").email,EMAIL)
    def test_arbitrary_purpose_and_admin_role_rejected(self):
        with self.assertRaises(ValidationError): endpoints.SendVerificationRequest(email=EMAIL,purpose="admin")
        with self.assertRaises(ValidationError): endpoints.VerifyCodeRequest(email=EMAIL,code="12345678",password=PASSWORD,account_type="admin")
    def test_weak_and_overlong_passwords_rejected(self):
        for password in ["short", "alllowercasepassword", "NoNumbersHere!", "NoSymbolsHere12", "A1!"+"x"*73]:
            with self.assertRaises(HTTPException): auth.validate_password(password)
        auth.validate_password(PASSWORD)

if __name__ == "__main__": unittest.main()
