import uuid
from sqlalchemy import Column, String, Boolean, Text, Numeric, Date, DateTime, Integer, ForeignKey, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="customer")
    
    email_verified = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    orders = relationship("Order", back_populates="customer")


class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    location = Column(String)
    duitnow_qr_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    is_preview = Column(Boolean, nullable=False, default=True, server_default="true")  # new stalls stay hidden until an admin shows them
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="false")  # admin closed this stall for good (reversible only by support, not shown in the vendors list)
    display_order = Column(Integer, nullable=False, default=0)
    pickup_schedule = Column(JSON, nullable=True)
    pickup_schedule_synced_on = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    price = Column(Numeric(10, 2), nullable=False)
    image_url = Column(String)
    is_available = Column(Boolean, default=True)
    approval_status = Column(String, nullable=False, default="approved", server_default="approved")  # approved / rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DailyFoodLog(Base):
    """Merchant-entered preparation and end-of-day outcome for one dish."""
    __tablename__ = "daily_food_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False)
    service_date = Column(Date, nullable=False)
    was_offered = Column(Boolean, nullable=True)  # NULL means older records did not answer
    prepared_portions = Column(Integer, nullable=False, default=0)
    unsold_portions = Column(Integer, nullable=False, default=0)
    discarded_portions = Column(Integer, nullable=False, default=0)
    sold_out = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DailyItemStock(Base):
    """Optional daily cap for bookable portions; orders remain the source of reservations."""
    __tablename__ = "daily_item_stock"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False)
    service_date = Column(Date, nullable=False)
    total_portions = Column(Integer, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SurplusOffer(Base):
    """Merchant-approved discount for a fixed pickup slot and limited portions."""
    __tablename__ = "surplus_offers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False)
    pickup_slot_id = Column(UUID(as_uuid=True), ForeignKey("pickup_slots.id", ondelete="SET NULL"), nullable=True)
    service_date = Column(Date, nullable=False)
    sale_price = Column(Numeric(10, 2), nullable=False)
    total_portions = Column(Integer, nullable=False)
    max_orders = Column(Integer, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    confirmed_safe_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PickupSlot(Base):
    __tablename__ = "pickup_slots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    time_slot = Column(DateTime(timezone=True), nullable=False)
    max_capacity = Column(Integer, nullable=False, default=10)
    current_bookings = Column(Integer, nullable=False, default=0)
    is_automatic = Column(Boolean, nullable=False, default=False, server_default="false")
    is_bookable = Column(Boolean, nullable=False, default=True, server_default="true")


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    
    # Statuses: pending_verification, preparing, ready, completed, cancelled_timeout
    status = Column(String, nullable=False, default="pending_verification") 
    total_price = Column(Numeric(10, 2), nullable=False)
    
    transaction_ref = Column(String, nullable=True)
    order_number = Column(String, nullable=True)
    checkout_key = Column(String, nullable=True, unique=True)
    checkout_fingerprint = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)
    rejection_note = Column(Text, nullable=True)
    
    pickup_slot_id = Column(UUID(as_uuid=True), ForeignKey("pickup_slots.id", ondelete="SET NULL"), nullable=True)
    pickup_service_date = Column(Date, nullable=True)  # retained if a completed slot is later removed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    customer = relationship("User", back_populates="orders")


class RefundRequest(Base):
    """Auditable manual refund case for a rejected, already-paid order."""
    __tablename__ = "refund_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, unique=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String, nullable=False, default="awaiting_customer", server_default="awaiting_customer")
    method = Column(String, nullable=True)  # online_bank / online_qr / walk_in
    reason = Column(String, nullable=False)
    rejection_note = Column(Text, nullable=True)

    # Sensitive payout fields are AES-GCM encrypted by the application. Only
    # the last four digits are kept separately for safe customer-facing display.
    legal_name_encrypted = Column(Text, nullable=True)
    bank_name_encrypted = Column(Text, nullable=True)
    account_number_encrypted = Column(Text, nullable=True)
    account_last4 = Column(String, nullable=True)
    duitnow_qr_path = Column(Text, nullable=True)

    proof_path = Column(Text, nullable=True)
    merchant_note = Column(Text, nullable=True)
    customer_dispute_note = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    requested_at = Column(DateTime(timezone=True), nullable=True)
    proof_uploaded_at = Column(DateTime(timezone=True), nullable=True)
    customer_responded_at = Column(DateTime(timezone=True), nullable=True)
    admin_approved_at = Column(DateTime(timezone=True), nullable=True)
    admin_approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)


class RefundAuditEvent(Base):
    """Append-only refund history. Sensitive payout values never belong here."""
    __tablename__ = "refund_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    refund_id = Column(UUID(as_uuid=True), ForeignKey("refund_requests.id", ondelete="CASCADE"), nullable=False)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role = Column(String, nullable=False)
    action = Column(String, nullable=False)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    evidence_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False)
    surplus_offer_id = Column(UUID(as_uuid=True), ForeignKey("surplus_offers.id"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    price_at_order = Column(Numeric(10, 2), nullable=False)
    special_instructions = Column(Text, nullable=True)
    original_price_at_order = Column(Numeric(10, 2), nullable=True)
    discount_at_order = Column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    promotion_id = Column(UUID(as_uuid=True), ForeignKey("promotions.id"), nullable=True)

    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem")



class Promotion(Base):
    __tablename__ = "promotions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False, index=True)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    discount_type = Column(String, nullable=False)
    discount_value = Column(Numeric(10, 2), nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    stopped_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text)
    location = Column(String, nullable=False)
    event_date = Column(Date, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)
    banner_image_url = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    merchants = relationship("EventMerchant", back_populates="event")


class EventMerchant(Base):
    __tablename__ = "event_vendors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    stall_number = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="merchants")


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, index=True)
    purpose = Column(String, nullable=False) 
    code_hash = Column(String, nullable=False) 
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AdminAuditLog(Base):
    """Append-only record of every admin change, for the two super-admins only.

    Snapshots the actor's name/email at write time (not a join) so the log still
    reads correctly even if that account is later renamed, role-changed, or deleted.
    """
    __tablename__ = "admin_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String, nullable=False)
    actor_email = Column(String, nullable=False)
    action = Column(String, nullable=False)  # short code, e.g. "merchant.deactivate"
    target_type = Column(String, nullable=True)  # "merchant" / "menu_item" / "user" / "event" / "pickup_slot" / "refund"
    target_id = Column(String, nullable=True)
    target_label = Column(String, nullable=True)  # human-readable name of the thing changed
    summary = Column(Text, nullable=False)  # one-line, human-readable description of exactly what changed
    details = Column(JSON, nullable=True)  # optional structured before/after values
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SDGMetric(Base):
    __tablename__ = "sdg_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    metric_type = Column(String, nullable=False)
    value = Column(Numeric(10, 2))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
