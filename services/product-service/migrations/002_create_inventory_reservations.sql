CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RESERVED'
        CHECK (status IN ('RESERVED', 'RELEASED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_reservation_items (
    reservation_id UUID NOT NULL
        REFERENCES inventory_reservations(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (reservation_id, product_id)
);

CREATE INDEX idx_inventory_reservations_expires_at
ON inventory_reservations(expires_at)
WHERE status = 'RESERVED';
