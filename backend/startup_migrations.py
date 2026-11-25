"""Database changes applied when the API starts."""

ORDER_STATUS_VALUES = (
    "draft",
    "pending_verification",
    "pending",
    "preparing",
    "ready",
    "completed",
    "rejected",
    "cancelled",
    "cancelled_timeout",
)
_ORDER_STATUS_SQL = ", ".join(f"'{value}'" for value in ORDER_STATUS_VALUES)
_ORDER_STATUS_MISSING_CHECKS = " OR ".join(
    f"current_definition NOT LIKE '%''{value}''%'" for value in ORDER_STATUS_VALUES
)
ORDER_STATUS_CONSTRAINT_MIGRATION = f"""
    DO $$
    DECLARE
        current_definition TEXT;
    BEGIN
        SELECT pg_get_constraintdef(oid)
        INTO current_definition
        FROM pg_constraint
        WHERE conrelid = 'orders'::regclass
          AND conname = 'orders_status_check';

        IF current_definition IS NULL OR {_ORDER_STATUS_MISSING_CHECKS} THEN
            ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
            ALTER TABLE orders
                ADD CONSTRAINT orders_status_check
                CHECK (status IN ({_ORDER_STATUS_SQL}));
        END IF;
    END;
    $$
"""


STARTUP_MIGRATIONS = [
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS pickup_schedule JSON",
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS pickup_schedule_synced_on DATE",
    "ALTER TABLE pickup_slots ADD COLUMN IF NOT EXISTS is_automatic BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE pickup_slots ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN NOT NULL DEFAULT TRUE",
    "CREATE UNIQUE INDEX IF NOT EXISTS pickup_slots_auto_time_unique ON pickup_slots (merchant_id, time_slot) WHERE is_automatic",
    "CREATE INDEX IF NOT EXISTS pickup_slots_merchant_time_idx ON pickup_slots (merchant_id, time_slot)",
    """
        CREATE TABLE IF NOT EXISTS surplus_offers (
            id UUID PRIMARY KEY,
            merchant_id UUID NOT NULL REFERENCES merchants(id),
            menu_item_id UUID NOT NULL REFERENCES menu_items(id),
            pickup_slot_id UUID REFERENCES pickup_slots(id) ON DELETE SET NULL,
            service_date DATE NOT NULL,
            sale_price NUMERIC(10, 2) NOT NULL CHECK (sale_price > 0),
            total_portions INTEGER NOT NULL CHECK (total_portions > 0),
            expires_at TIMESTAMPTZ NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            confirmed_safe_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """,
    "ALTER TABLE surplus_offers ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE surplus_offers ADD COLUMN IF NOT EXISTS max_orders INTEGER",
    """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surplus_offers_max_orders_check') THEN
                ALTER TABLE surplus_offers ADD CONSTRAINT surplus_offers_max_orders_check
                CHECK (max_orders IS NULL OR max_orders BETWEEN 1 AND 1000);
            END IF;
        END $$
    """,
    "CREATE INDEX IF NOT EXISTS surplus_offers_merchant_expiry_idx ON surplus_offers (merchant_id, expires_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS surplus_offers_one_active_dish_day_idx ON surplus_offers (merchant_id, menu_item_id, service_date) WHERE is_active",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS surplus_offer_id UUID REFERENCES surplus_offers(id)",
    "CREATE INDEX IF NOT EXISTS order_items_surplus_offer_idx ON order_items (surplus_offer_id)",
    """
        CREATE TABLE IF NOT EXISTS daily_item_stock (
            id UUID PRIMARY KEY,
            merchant_id UUID NOT NULL REFERENCES merchants(id),
            menu_item_id UUID NOT NULL REFERENCES menu_items(id),
            service_date DATE NOT NULL,
            total_portions INTEGER NOT NULL CHECK (total_portions >= 0),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT daily_item_stock_merchant_item_date_unique
                UNIQUE (merchant_id, menu_item_id, service_date)
        )
    """,
    "ALTER TABLE daily_item_stock ENABLE ROW LEVEL SECURITY",
    "CREATE INDEX IF NOT EXISTS daily_item_stock_merchant_date_idx ON daily_item_stock (merchant_id, service_date)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_service_date DATE",
    """
        UPDATE orders AS o SET pickup_service_date =
            (timezone('Asia/Kuala_Lumpur', p.time_slot))::date
        FROM pickup_slots AS p
        WHERE o.pickup_slot_id = p.id AND o.pickup_service_date IS NULL
    """,
    "CREATE INDEX IF NOT EXISTS orders_merchant_service_date_idx ON orders (merchant_id, pickup_service_date, status)",
    """
        CREATE TABLE IF NOT EXISTS daily_food_logs (
            id UUID PRIMARY KEY,
            merchant_id UUID NOT NULL REFERENCES merchants(id),
            menu_item_id UUID NOT NULL REFERENCES menu_items(id),
            service_date DATE NOT NULL,
            prepared_portions INTEGER NOT NULL DEFAULT 0 CHECK (prepared_portions >= 0),
            unsold_portions INTEGER NOT NULL DEFAULT 0 CHECK (unsold_portions >= 0),
            discarded_portions INTEGER NOT NULL DEFAULT 0 CHECK (discarded_portions >= 0),
            sold_out BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT daily_food_logs_portions_check
                CHECK (unsold_portions + discarded_portions <= prepared_portions),
            CONSTRAINT daily_food_logs_merchant_item_date_unique
                UNIQUE (merchant_id, menu_item_id, service_date)
        )
    """,
    "ALTER TABLE daily_food_logs ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE daily_food_logs ADD COLUMN IF NOT EXISTS was_offered BOOLEAN",
    "CREATE INDEX IF NOT EXISTS daily_food_logs_merchant_date_idx ON daily_food_logs (merchant_id, service_date DESC)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_key VARCHAR",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_fingerprint VARCHAR",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_note TEXT",
    ORDER_STATUS_CONSTRAINT_MIGRATION,
    "CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_key_unique ON orders (checkout_key)",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_instructions TEXT",
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE merchants ALTER COLUMN is_preview SET DEFAULT TRUE",
    "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS approval_status VARCHAR NOT NULL DEFAULT 'approved'",
    """
        CREATE TABLE IF NOT EXISTS refund_requests (
            id UUID PRIMARY KEY,
            order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
            customer_id UUID NOT NULL REFERENCES users(id),
            merchant_id UUID NOT NULL REFERENCES merchants(id),
            amount NUMERIC(10, 2) NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'awaiting_customer',
            method VARCHAR,
            reason VARCHAR NOT NULL,
            rejection_note TEXT,
            legal_name_encrypted TEXT,
            bank_name_encrypted TEXT,
            account_number_encrypted TEXT,
            account_last4 VARCHAR,
            duitnow_qr_path TEXT,
            proof_path TEXT,
            merchant_note TEXT,
            customer_dispute_note TEXT,
            admin_note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            requested_at TIMESTAMPTZ,
            proof_uploaded_at TIMESTAMPTZ,
            customer_responded_at TIMESTAMPTZ,
            admin_approved_at TIMESTAMPTZ,
            admin_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            verified_at TIMESTAMPTZ
        )
    """,
    "ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMPTZ",
    "ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS admin_approved_by UUID REFERENCES users(id) ON DELETE SET NULL",
    """
        UPDATE refund_requests
        SET admin_approved_at = COALESCE(admin_approved_at, requested_at, created_at)
        WHERE admin_approved_at IS NULL
          AND status IN ('proof_submitted', 'customer_confirmed', 'disputed', 'verified')
    """,
    "CREATE INDEX IF NOT EXISTS refund_requests_merchant_status_idx ON refund_requests (merchant_id, status)",
    "CREATE INDEX IF NOT EXISTS refund_requests_customer_idx ON refund_requests (customer_id, created_at DESC)",
    """
        CREATE TABLE IF NOT EXISTS refund_audit_events (
            id UUID PRIMARY KEY,
            refund_id UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
            actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_role VARCHAR NOT NULL,
            action VARCHAR NOT NULL,
            from_status VARCHAR,
            to_status VARCHAR NOT NULL,
            note TEXT,
            evidence_path TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """,
    "CREATE INDEX IF NOT EXISTS refund_audit_events_refund_idx ON refund_audit_events (refund_id, created_at)",
    """
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id UUID PRIMARY KEY,
            actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_name VARCHAR NOT NULL,
            actor_email VARCHAR NOT NULL,
            action VARCHAR NOT NULL,
            target_type VARCHAR,
            target_id VARCHAR,
            target_label VARCHAR,
            summary TEXT NOT NULL,
            details JSON,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """,
    "CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx ON admin_audit_logs (target_type, target_id)",
]
