import test from "node:test";
import assert from "node:assert/strict";
import { addItemSchema, consumeCartSchema, productParamsSchema, updateItemSchema } from "../src/schemas/cart.schema.js";

test("coerces valid cart item input", () => {
    assert.deepEqual(addItemSchema.parse({ productId: "1", quantity: "2" }), { productId: 1, quantity: 2 });
    assert.deepEqual(productParamsSchema.parse({ productId: "3" }), { productId: 3 });
});

test("rejects invalid cart quantities", () => {
    assert.equal(addItemSchema.safeParse({ productId: 1, quantity: 0 }).success, false);
    assert.equal(updateItemSchema.safeParse({ quantity: 1000 }).success, false);
});

test("requires a unique product list for idempotent cart consumption", () => {
    const orderId = "123e4567-e89b-42d3-a456-426614174000";
    assert.equal(consumeCartSchema.safeParse({ orderId, userId: 2, items: [{ productId: 1, quantity: 2 }] }).success, true);
    assert.equal(consumeCartSchema.safeParse({
        orderId, userId: 2, items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }],
    }).success, false);
});
