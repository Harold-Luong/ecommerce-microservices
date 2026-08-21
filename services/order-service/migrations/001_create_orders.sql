CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PENDING_PAYMENT', 'CANCEL_PENDING', 'CANCELLED', 'FAILED')),
    request_items JSONB NOT NULL,
    reservation_id UUID,
    total_amount NUMERIC(15, 2),
    cart_consumed BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, idempotency_key)
);

CREATE TABLE order_items (
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(15, 2) NOT NULL CHECK (subtotal >= 0),
    PRIMARY KEY (order_id, product_id)
);

CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
