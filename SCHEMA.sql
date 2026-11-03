-- PayNet tables for a NEW, empty Supabase project. See DEPLOYMENT.md, step 1.
-- Paste into Supabase > SQL Editor and run once, BEFORE the backend starts for the first time.
-- Existing projects do not need this: the backend adds new columns itself on startup.

CREATE TABLE users (
	id UUID NOT NULL,
	name VARCHAR NOT NULL,
	phone_number VARCHAR,
	email VARCHAR NOT NULL,
	password_hash VARCHAR NOT NULL,
	role VARCHAR NOT NULL,
	email_verified BOOLEAN,
	is_deleted BOOLEAN,
	deleted_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	UNIQUE (email)
);

CREATE TABLE events (
	id UUID NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	location VARCHAR NOT NULL,
	event_date DATE NOT NULL,
	start_time TIMESTAMP WITH TIME ZONE NOT NULL,
	end_time TIMESTAMP WITH TIME ZONE NOT NULL,
	is_active BOOLEAN,
	banner_image_url VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE TABLE email_verifications (
	id UUID NOT NULL,
	email VARCHAR NOT NULL,
	purpose VARCHAR NOT NULL,
	code_hash VARCHAR NOT NULL,
	attempts INTEGER NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE INDEX ix_email_verifications_email ON email_verifications (email);

CREATE TABLE merchants (
	id UUID NOT NULL,
	user_id UUID NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	location VARCHAR,
	duitnow_qr_url TEXT,
	is_active BOOLEAN,
	is_preview BOOLEAN DEFAULT 'true' NOT NULL,
	display_order INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE menu_items (
	id UUID NOT NULL,
	merchant_id UUID NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	price NUMERIC(10, 2) NOT NULL,
	image_url VARCHAR,
	is_available BOOLEAN,
	approval_status VARCHAR DEFAULT 'approved' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(merchant_id) REFERENCES merchants (id)
);

CREATE TABLE pickup_slots (
	id UUID NOT NULL,
	merchant_id UUID NOT NULL,
	time_slot TIMESTAMP WITH TIME ZONE NOT NULL,
	max_capacity INTEGER NOT NULL,
	current_bookings INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(merchant_id) REFERENCES merchants (id)
);

CREATE TABLE event_vendors (
	id UUID NOT NULL,
	event_id UUID NOT NULL,
	merchant_id UUID NOT NULL,
	stall_number VARCHAR,
	is_active BOOLEAN,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(event_id) REFERENCES events (id),
	FOREIGN KEY(merchant_id) REFERENCES merchants (id)
);

CREATE TABLE orders (
	id UUID NOT NULL,
	customer_id UUID NOT NULL,
	merchant_id UUID NOT NULL,
	status VARCHAR NOT NULL,
	total_price NUMERIC(10, 2) NOT NULL,
	transaction_ref VARCHAR,
	order_number VARCHAR,
	pickup_slot_id UUID,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(customer_id) REFERENCES users (id),
	FOREIGN KEY(merchant_id) REFERENCES merchants (id),
	FOREIGN KEY(pickup_slot_id) REFERENCES pickup_slots (id)
);

CREATE TABLE order_items (
	id UUID NOT NULL,
	order_id UUID NOT NULL,
	menu_item_id UUID NOT NULL,
	quantity INTEGER NOT NULL,
	price_at_order NUMERIC(10, 2) NOT NULL,
	special_instructions TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(order_id) REFERENCES orders (id),
	FOREIGN KEY(menu_item_id) REFERENCES menu_items (id)
);

CREATE TABLE sdg_metrics (
	id UUID NOT NULL,
	order_id UUID NOT NULL,
	metric_type VARCHAR NOT NULL,
	value NUMERIC(10, 2),
	recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(order_id) REFERENCES orders (id)
);


-- Same extra column the team added in ADMIN_MIGRATIONS.sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_url text;

-- Storage: "uploads" is public (QR codes, menu photos, banners).
-- "receipts" is PRIVATE (payment receipts, served through 1-hour signed links).
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true), ('receipts', 'receipts', false) ON CONFLICT (id) DO NOTHING;
