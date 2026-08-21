ALTER TABLE cart_consumptions
ADD COLUMN IF NOT EXISTS request_items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cart_consumptions
ALTER COLUMN request_items DROP DEFAULT;
