import { db } from "../../src/config/database.js";

const categories = [
    { name: "Laptop", slug: "laptop" },
    { name: "Smartphone", slug: "smartphone" },
    { name: "Tablet", slug: "tablet" },
    { name: "Accessories", slug: "accessories" },
];

const products = [
    { categorySlug: "laptop", name: "MacBook Pro 14", price: 45000000, stock: 10 },
    { categorySlug: "laptop", name: "Dell XPS 13", price: 32000000, stock: 15 },
    { categorySlug: "smartphone", name: "iPhone 17", price: 30000000, stock: 20 },
    { categorySlug: "smartphone", name: "Samsung Galaxy S26", price: 27000000, stock: 18 },
    { categorySlug: "tablet", name: "iPad Air", price: 18000000, stock: 12 },
    { categorySlug: "accessories", name: "Wireless Mouse", price: 750000, stock: 50 },
];

async function seed() {
    let client;

    try {
        client = await db.connect();
        await client.query("BEGIN");

        for (const category of categories) {
            await client.query(`
                INSERT INTO categories (name, slug)
                VALUES ($1, $2)
                ON CONFLICT (slug) DO UPDATE
                SET name = EXCLUDED.name,
                    updated_at = NOW()
            `, [category.name, category.slug]);
        }

        for (const product of products) {
            await client.query(`
                WITH input AS (
                    SELECT
                        $1::VARCHAR(255) AS category_slug,
                        $2::VARCHAR(255) AS product_name,
                        $3::NUMERIC(15, 2) AS product_price,
                        $4::INTEGER AS product_stock
                )
                INSERT INTO products (category_id, name, price, stock)
                SELECT c.id, i.product_name, i.product_price, i.product_stock
                FROM input i
                JOIN categories c ON c.slug = i.category_slug
                WHERE NOT EXISTS (
                      SELECT 1
                      FROM products p
                      WHERE p.category_id = c.id
                        AND p.name = i.product_name
                  )
            `, [product.categorySlug, product.name, product.price, product.stock]);
        }

        await client.query("COMMIT");
        console.log(`Seed completed: ${categories.length} categories, ${products.length} products.`);
    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error("Seed failed:", error);
        process.exitCode = 1;
    } finally {
        client?.release();
        await db.end();
    }
}

seed();
