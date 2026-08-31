import uuid
from sqlalchemy import Column, String, Boolean, Text, Numeric, Date, DateTime, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="customer")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    location = Column(String)
    is_active = Column(Boolean, default=True)
    is_temporary = Column(Boolean, default=False)
    active_from = Column(Date)
    active_until = Column(Date)
    # REMOVED the physical ForeignKey constraint here to prevent the circular dependency loop
    rental_booking_id = Column(UUID(as_uuid=True)) 
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PickupSlot(Base):
    __tablename__ = "pickup_slots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    time_slot = Column(DateTime(timezone=True), nullable=False)
    max_capacity = Column(Integer, nullable=False, default=10)
    current_bookings = Column(Integer, nullable=False, default=0)


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"), nullable=False)
    status = Column(String, nullable=False, default="pending")
    total_price = Column(Numeric(10, 2), nullable=False)
    pickup_slot_id = Column(UUID(as_uuid=True), ForeignKey("pickup_slots.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    price_at_order = Column(Numeric(10, 2), nullable=False)


class BoulevardStall(Base):
    __tablename__ = "boulevard_stalls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stall_number = Column(String, nullable=False)
    location = Column(String, nullable=False)
    size = Column(String)
    rental_rate = Column(Numeric(10, 2), nullable=False)


class RentalBooking(Base):
    __tablename__ = "rental_bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    stall_id = Column(UUID(as_uuid=True), ForeignKey("boulevard_stalls.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="pending")
    deposit_paid = Column(Boolean, default=False)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SDGMetric(Base):
    __tablename__ = "sdg_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    metric_type = Column(String, nullable=False)
    value = Column(Numeric(10, 2))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
