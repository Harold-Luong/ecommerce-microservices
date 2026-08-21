import { db } from "../config/database.js";

export async function findCartByUserId(userId) {
    const cartResult = await db.query(`
        SELECT id, user_id, created_at, updated_at
        FROM carts WHERE user_id = $1 LIMIT 1
    `, [userId]);
    const cart = cartResult.rows[0];
    if (!cart) return null;

    const itemsResult = await db.query(`
        SELECT id, product_id, quantity, created_at, updated_at
        FROM cart_items
        WHERE cart_id = $1
        ORDER BY created_at ASC, id ASC
    `, [cart.id]);
    return { ...cart, items: itemsResult.rows };
}

export async function addItem(userId, { productId, quantity }, maxStock) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const cartResult = await client.query(`
            INSERT INTO carts (user_id) VALUES ($1)
            ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
            RETURNING id
        `, [userId]);
        const cartId = cartResult.rows[0].id;

        const itemResult = await client.query(`
            INSERT INTO cart_items (cart_id, product_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (cart_id, product_id) DO UPDATE
            SET quantity = cart_items.quantity + EXCLUDED.quantity,
                updated_at = NOW()
            WHERE cart_items.quantity + EXCLUDED.quantity <= $4
            RETURNING id, product_id, quantity, created_at, updated_at
        `, [cartId, productId, quantity, maxStock]);

        if (!itemResult.rows[0]) {
            const error = new Error("Requested quantity exceeds available stock");
            error.statusCode = 409;
            throw error;
        }

        await client.query("COMMIT");
        return itemResult.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function updateItem(userId, productId, quantity) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`
            UPDATE cart_items ci
            SET quantity = $3, updated_at = NOW()
            FROM carts c
            WHERE ci.cart_id = c.id AND c.user_id = $1 AND ci.product_id = $2
            RETURNING ci.id, ci.product_id, ci.quantity, ci.created_at, ci.updated_at, c.id AS cart_id
        `, [userId, productId, quantity]);
        const item = result.rows[0];
        if (item) await client.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [item.cart_id]);
        await client.query("COMMIT");
        if (!item) return null;
        const { cart_id, ...response } = item;
        return response;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function deleteItem(userId, productId) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`
            DELETE FROM cart_items ci
            USING carts c
            WHERE ci.cart_id = c.id AND c.user_id = $1 AND ci.product_id = $2
            RETURNING c.id AS cart_id
        `, [userId, productId]);
        if (result.rows[0]) await client.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [result.rows[0].cart_id]);
        await client.query("COMMIT");
        return result.rowCount > 0;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function clearCart(userId) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const cartResult = await client.query("SELECT id FROM carts WHERE user_id = $1 FOR UPDATE", [userId]);
        const cart = cartResult.rows[0];
        if (cart) {
            await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cart.id]);
            await client.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [cart.id]);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function consumeItems(orderId, userId, items) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const consumption = await client.query(`
            INSERT INTO cart_consumptions (order_id, user_id, request_items)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (order_id) DO NOTHING
            RETURNING order_id
        `, [orderId, userId, JSON.stringify(items)]);
        if (!consumption.rows[0]) {
            const existing = await client.query(`
                SELECT user_id, request_items = $2::jsonb AS same_items
                FROM cart_consumptions WHERE order_id = $1
            `, [orderId, JSON.stringify(items)]);
            if (String(existing.rows[0].user_id) !== String(userId) || !existing.rows[0].same_items) {
                const error = new Error("Order ID was already consumed with a different cart request");
                error.statusCode = 409;
                throw error;
            }
            await client.query("COMMIT");
            return;
        }
        const cartResult = await client.query("SELECT id FROM carts WHERE user_id = $1 FOR UPDATE", [userId]);
        const cart = cartResult.rows[0];
        if (!cart) {
            await client.query("COMMIT");
            return;
        }

        for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
            const updated = await client.query(`
                UPDATE cart_items
                SET quantity = quantity - $3, updated_at = NOW()
                WHERE cart_id = $1 AND product_id = $2 AND quantity > $3
                RETURNING id
            `, [cart.id, item.productId, item.quantity]);
            if (!updated.rows[0]) {
                await client.query(`
                    DELETE FROM cart_items
                    WHERE cart_id = $1 AND product_id = $2 AND quantity <= $3
                `, [cart.id, item.productId, item.quantity]);
            }
        }
        await client.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [cart.id]);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
