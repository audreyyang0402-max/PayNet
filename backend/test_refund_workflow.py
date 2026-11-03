"""Offline regression tests for refund privacy and state labels."""
import base64
import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["REFUND_DATA_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"r" * 32).decode()

import main


def refund_record():
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid4(), order_id=uuid4(), customer_id=uuid4(), merchant_id=uuid4(),
        amount=12.50, status="awaiting_refund", method="online_bank",
        reason="item_sold_out", rejection_note="Last portion sold out",
        legal_name_encrypted=main.encrypt_refund_value("Ava Student"),
        bank_name_encrypted=main.encrypt_refund_value("Example Bank"),
        account_number_encrypted=main.encrypt_refund_value("1234567890"),
        account_last4="7890", duitnow_qr_path=None, proof_path=None,
        merchant_note=None, customer_dispute_note=None, admin_note=None,
        created_at=now, requested_at=now, proof_uploaded_at=None,
        customer_responded_at=None, verified_at=None,
    )


class RefundPrivacyTests(unittest.TestCase):
    def test_refund_values_round_trip_with_random_nonce(self):
        first = main.encrypt_refund_value("1234567890")
        second = main.encrypt_refund_value("1234567890")
        self.assertNotEqual(first, second)
        self.assertEqual(main.decrypt_refund_value(first), "1234567890")

    def test_customer_payload_never_contains_bank_secrets(self):
        payload = main.serialize_refund(refund_record(), "customer")
        self.assertNotIn("account_number", payload)
        self.assertNotIn("bank_name", payload)
        self.assertNotIn("legal_name", payload)
        self.assertEqual(payload["account_last4"], "7890")

    def test_merchant_payload_can_decrypt_payout_details(self):
        payload = main.serialize_refund(refund_record(), "merchant")
        self.assertEqual(payload["legal_name"], "Ava Student")
        self.assertEqual(payload["bank_name"], "Example Bank")
        self.assertEqual(payload["account_number"], "1234567890")

    def test_only_fulfilment_failures_auto_open_refunds(self):
        self.assertEqual(main.REFUND_ELIGIBLE_REJECTION_REASONS, {"item_sold_out", "stall_unable", "other"})
        self.assertNotIn("invalid_payment", main.REFUND_ELIGIBLE_REJECTION_REASONS)


if __name__ == "__main__":
    unittest.main()
