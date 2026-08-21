import test from "node:test";
import assert from "node:assert/strict";
import { createCategorySchema } from "../src/schemas/category.schema.js";
import { createProductSchema, listProductsSchema, updateProductSchema } from "../src/schemas/product.schema.js";

test("normalizes valid category input", () => {
    assert.deepEqual(createCategorySchema.parse({ name: "  Laptop  ", slug: "laptop" }), { name: "Laptop", slug: "laptop" });
});

test("rejects invalid category slug", () => {
    assert.equal(createCategorySchema.safeParse({ name: "Laptop", slug: "Laptop Computer" }).success, false);
});

test("creates product defaults and coerces input", () => {
    assert.deepEqual(createProductSchema.parse({ categoryId: "1", name: "Phone", price: "99.99" }), {
        categoryId: 1, name: "Phone", price: 99.99, stock: 0,
    });
});

test("requires at least one update field", () => {
    assert.equal(updateProductSchema.safeParse({}).success, false);
});

test("validates pagination and price range", () => {
    assert.deepEqual(listProductsSchema.parse({ page: "2", limit: "10" }), { page: 2, limit: 10 });
    assert.equal(listProductsSchema.safeParse({ minPrice: 10, maxPrice: 5 }).success, false);
});
