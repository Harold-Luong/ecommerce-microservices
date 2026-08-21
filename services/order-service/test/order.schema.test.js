import test from "node:test";
import assert from "node:assert/strict";
import { idempotencyKeySchema, listOrdersSchema, orderParamsSchema } from "../src/schemas/order.schema.js";

test("validates order identifiers and pagination", () => {
    assert.equal(idempotencyKeySchema.parse("checkout-123"), "checkout-123");
    assert.deepEqual(listOrdersSchema.parse({ page: "2", limit: "10" }), { page: 2, limit: 10 });
    assert.equal(orderParamsSchema.safeParse({ id: "not-a-uuid" }).success, false);
});

test("rejects short idempotency keys", () => {
    assert.equal(idempotencyKeySchema.safeParse("short").success, false);
});
