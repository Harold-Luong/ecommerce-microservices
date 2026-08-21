import test from "node:test";
import assert from "node:assert/strict";
import { getAvailability } from "../src/services/cart.service.js";

test("marks an item available when stock covers its quantity", () => {
    assert.deepEqual(getAvailability({ stock: 5 }, 3), {
        available: true,
        availabilityReason: null,
    });
});

test("marks a missing product unavailable", () => {
    assert.deepEqual(getAvailability(null, 1), {
        available: false,
        availabilityReason: "PRODUCT_NOT_FOUND",
    });
});

test("marks an out-of-stock product unavailable", () => {
    assert.deepEqual(getAvailability({ stock: 0 }, 1), {
        available: false,
        availabilityReason: "OUT_OF_STOCK",
    });
});

test("marks insufficient stock unavailable", () => {
    assert.deepEqual(getAvailability({ stock: 2 }, 3), {
        available: false,
        availabilityReason: "INSUFFICIENT_STOCK",
    });
});
