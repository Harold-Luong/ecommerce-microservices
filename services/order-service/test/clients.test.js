import test from "node:test";
import assert from "node:assert/strict";
import { consumeCart } from "../src/clients/cart.client.js";
import { reserveInventory } from "../src/clients/product.client.js";

const orderId = "123e4567-e89b-42d3-a456-426614174000";

test("uses orderId for both inventory and cart idempotency", { concurrency: false }, async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ data: { id: orderId, status: "RESERVED", items: [] } }), {
            status: 200, headers: { "content-type": "application/json" },
        });
    };
    try {
        await reserveInventory(orderId, 2, [{ productId: 1, quantity: 1 }]);
        await consumeCart(orderId, 2, [{ productId: 1, quantity: 1 }]);
        assert.equal(calls[0].body.orderId, orderId);
        assert.equal(calls[1].body.orderId, orderId);
    } finally { globalThis.fetch = originalFetch; }
});
