import { db } from "../../src/config/database.js";

const carts = [
    {
        userId: process.env.SEED_ADMIN_USER_ID || "1",
        items: [
            { productId: process.env.SEED_PRODUCT_ID_1 || "1", quantity: 1 },
        ],
    },
    {
        userId: process.env.SEED_USER_ID || "2",
        items: [
            { productId: process.env.SEED_PRODUCT_ID_2 || "2", quantity: 2 },
            { productId: process.env.SEED_PRODUCT_ID_3 || "3", quantity: 1 },
        ],
    },
];

async function seed() {
    let client;

    try {
        client = await db.connect();
        await client.query("BEGIN");

        for (const cart of carts) {
            const cartResult = await client.query(`
                INSERT INTO carts (user_id)
                VALUES ($1)
                ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
                RETURNING id
            `, [cart.userId]);
            const cartId = cartResult.rows[0].id;

            for (const item of cart.items) {
                await client.query(`
                    INSERT INTO cart_items (cart_id, product_id, quantity)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (cart_id, product_id) DO UPDATE
                    SET quantity = EXCLUDED.quantity,
                        updated_at = NOW()
                `, [cartId, item.productId, item.quantity]);
            }
        }

        await client.query("COMMIT");
        console.log(`Seed completed: ${carts.length} carts.`);
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
