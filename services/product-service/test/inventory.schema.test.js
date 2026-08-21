import test from "node:test";
import assert from "node:assert/strict";
import { reserveInventorySchema } from "../src/schemas/inventory.schema.js";

const orderId = "123e4567-e89b-42d3-a456-426614174000";

test("accepts a valid inventory reservation", () => {
    const result = reserveInventorySchema.parse({ orderId, userId: "2", items: [{ productId: 1, quantity: 2 }] });
    assert.equal(result.expiresInSeconds, 900);
});

test("rejects duplicate products", () => {
    const result = reserveInventorySchema.safeParse({
        orderId, userId: 2, items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }],
    });
    assert.equal(result.success, false);
});
