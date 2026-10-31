"""Offline checks for deletion verification and immutable merchant identity."""
import os
os.environ["DATABASE_URL"]="postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"]="test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"]=""
os.environ["SUPABASE_SERVICE_ROLE_KEY"]=""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from fastapi import HTTPException
from pydantic import ValidationError
import auth_endpoints as auth
import main

class AccountManagementTests(unittest.IsolatedAsyncioTestCase):
    def user(self):
        return SimpleNamespace(id=uuid4(),role="merchant",email="owner@example.test",password_hash="hash",is_deleted=False)
    def db(self,active=0):
        db=MagicMock(); merchants=MagicMock(); merchants.scalars.return_value.all.return_value=[]
        count=MagicMock();count.scalar_one.return_value=active
        db.execute=AsyncMock(side_effect=[merchants,count,MagicMock()])
        db.commit=AsyncMock()
        return db
    async def test_missing_code_rejected(self):
        with self.assertRaises(ValidationError): auth.DeleteAccountRequest(password="password")
    async def test_wrong_password_does_not_send_code(self):
        with patch.object(auth,"verify_password",return_value=False),patch.object(auth,"issue_code",new_callable=AsyncMock) as issue:
            with self.assertRaises(HTTPException): await auth.send_delete_code(auth.DeleteCodeRequest(password="bad"),self.user(),self.db())
            issue.assert_not_awaited()
    async def test_send_code_bound_to_authenticated_email_and_delete_purpose(self):
        user=self.user(); db=self.db()
        with patch.object(auth,"verify_password",return_value=True),patch.object(auth,"issue_code",new_callable=AsyncMock) as issue:
            await auth.send_delete_code(auth.DeleteCodeRequest(password="correct"),user,db)
            issue.assert_awaited_once_with(db,user.email,"delete")
    async def test_invalid_code_cannot_delete(self):
        user=self.user();db=self.db()
        with patch.object(auth,"verify_password",return_value=True),patch.object(auth,"check_code",new_callable=AsyncMock,side_effect=HTTPException(400,"Invalid")):
            with self.assertRaises(HTTPException): await auth.delete_account(auth.DeleteAccountRequest(password="correct",code="00123456"),user,db)
        self.assertFalse(user.is_deleted);db.commit.assert_not_awaited()
    async def test_active_orders_block_deletion_without_consuming_code(self):
        db=self.db(active=1)
        with patch.object(auth,"verify_password",return_value=True),patch.object(auth,"check_code",new_callable=AsyncMock) as check:
            with self.assertRaises(HTTPException): await auth.delete_account(auth.DeleteAccountRequest(password="correct",code="00123456"),self.user(),db)
            check.assert_not_awaited()
    async def test_success_requires_password_and_delete_code(self):
        user=self.user();db=self.db()
        with patch.object(auth,"verify_password",return_value=True),patch.object(auth,"check_code",new_callable=AsyncMock) as check:
            await auth.delete_account(auth.DeleteAccountRequest(password="correct",code="00123456"),user,db)
            check.assert_awaited_once_with(db,"owner@example.test","delete","00123456")
        self.assertTrue(user.is_deleted);self.assertTrue(user.email.startswith("deleted-"));db.commit.assert_awaited_once()
    async def test_registered_name_location_and_email_locked(self):
        for field in ("store_name","location","email"):
            db=MagicMock();result=MagicMock();result.scalars.return_value.first.return_value=SimpleNamespace(name="Original",location="Fresco")
            db.execute=AsyncMock(return_value=result);db.commit=AsyncMock()
            data=main.MerchantProfileUpdate(**{field:"other@example.com" if field=="email" else "Other"})
            with self.assertRaises(HTTPException): await main.update_my_merchant_profile(data,db,self.user())
            db.commit.assert_not_awaited()
    async def test_all_self_delete_routes_use_same_guard(self):
        for path in ("/users/me","/api/users/me","/users/me/account"):
            route=next(r for r in main.app.routes if r.path==path and "DELETE" in r.methods)
            with patch.object(main,"delete_account",new_callable=AsyncMock) as guard:
                user=self.user();db=self.db();req=auth.DeleteAccountRequest(password="p",code="12345678")
                if path=="/users/me/account":await route.endpoint(req,user,db)
                else:await route.endpoint(req,db,user)
                guard.assert_awaited_once_with(req,user,db)

    async def test_http_routes_require_and_forward_code(self):
        from fastapi.testclient import TestClient
        user=self.user();db=self.db()
        main.app.dependency_overrides[main.get_current_user]=lambda:user
        main.app.dependency_overrides[main.get_db]=lambda:db
        try:
            client=TestClient(main.app)
            for path in ("/users/me","/api/users/me","/users/me/account"):
                self.assertEqual(client.request("DELETE",path,json={"password":"p"}).status_code,422)
                with patch.object(main,"delete_account",new_callable=AsyncMock,return_value={"message":"deleted"}) as guard:
                    response=client.request("DELETE",path,json={"password":"p","code":"00123456"})
                    self.assertEqual(response.status_code,200)
                    self.assertEqual(guard.await_args.args[0].code,"00123456")
        finally:
            main.app.dependency_overrides.clear()
