import test from "node:test";
import assert from "node:assert/strict";
import { getProduct } from "../src/clients/product.client.js";

test("returns product data from product-service", { concurrency: false }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { id: "1", stock: 10 } }), {
        status: 200, headers: { "content-type": "application/json" },
    });
    try {
        assert.deepEqual(await getProduct(1), { id: "1", stock: 10 });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("maps a missing product to 404", { concurrency: false }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404 });
    try {
        await assert.rejects(getProduct(999), (error) => error.statusCode === 404);
        assert.equal(await getProduct(999, { allowMissing: true }), null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
