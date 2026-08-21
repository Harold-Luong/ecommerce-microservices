CREATE TABLE cart_consumptions (
    order_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_items JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cart_consumptions_user_id ON cart_consumptions(user_id);
