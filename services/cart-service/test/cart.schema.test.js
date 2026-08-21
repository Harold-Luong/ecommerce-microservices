import test from "node:test";
import assert from "node:assert/strict";
import { addItemSchema, productParamsSchema, updateItemSchema } from "../src/schemas/cart.schema.js";

test("coerces valid cart item input", () => {
    assert.deepEqual(addItemSchema.parse({ productId: "1", quantity: "2" }), { productId: 1, quantity: 2 });
    assert.deepEqual(productParamsSchema.parse({ productId: "3" }), { productId: 3 });
});

test("rejects invalid cart quantities", () => {
    assert.equal(addItemSchema.safeParse({ productId: 1, quantity: 0 }).success, false);
    assert.equal(updateItemSchema.safeParse({ quantity: 1000 }).success, false);
});
