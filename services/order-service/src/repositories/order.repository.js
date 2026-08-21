import crypto from "node:crypto";
import { db } from "../config/database.js";

async function hydrateOrder(queryable, order) {
    if (!order) return null;
    const items = await queryable.query(`
        SELECT product_id, product_name, unit_price, quantity, subtotal
        FROM order_items WHERE order_id = $1 ORDER BY product_id
    `, [order.id]);
    return { ...order, items: items.rows };
}

export async function findOrderByIdempotency(userId, idempotencyKey) {
    const result = await db.query(`
        SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1
    `, [userId, idempotencyKey]);
    return hydrateOrder(db, result.rows[0]);
}

export async function createPendingOrder(userId, idempotencyKey, requestItems) {
    const orderId = crypto.randomUUID();
    const result = await db.query(`
        INSERT INTO orders (id, user_id, idempotency_key, request_items)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING *
    `, [orderId, userId, idempotencyKey, JSON.stringify(requestItems)]);
    if (result.rows[0]) return { order: await hydrateOrder(db, result.rows[0]), created: true };
    return { order: await findOrderByIdempotency(userId, idempotencyKey), created: false };
}

export async function finalizeOrder(orderId, reservation) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
        const order = locked.rows[0];
        if (!order) {
            await client.query("COMMIT");
            return null;
        }
        if (order.status === "PENDING_PAYMENT") {
            const existing = await hydrateOrder(client, order);
            await client.query("COMMIT");
            return existing;
        }
        if (order.status !== "PENDING") {
            const error = new Error(`Order cannot be finalized from status ${order.status}`);
            error.statusCode = 409;
            throw error;
        }

        for (const item of reservation.items) {
            await client.query(`
                INSERT INTO order_items (
                    order_id, product_id, product_name, unit_price, quantity, subtotal
                ) VALUES ($1, $2, $3, $4, $5, $4::numeric * $5)
                ON CONFLICT (order_id, product_id) DO NOTHING
            `, [orderId, item.product_id, item.product_name, item.unit_price, item.quantity]);
        }
        const total = await client.query("SELECT COALESCE(SUM(subtotal), 0) AS total FROM order_items WHERE order_id = $1", [orderId]);
        const updated = await client.query(`
            UPDATE orders
            SET status = 'PENDING_PAYMENT', reservation_id = $2,
                total_amount = $3, updated_at = NOW()
            WHERE id = $1 RETURNING *
        `, [orderId, reservation.id, total.rows[0].total]);
        const completed = await hydrateOrder(client, updated.rows[0]);
        await client.query("COMMIT");
        return completed;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function markOrderFailed(orderId, reason) {
    await db.query(`
        UPDATE orders SET status = 'FAILED', failure_reason = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'PENDING'
    `, [orderId, reason.slice(0, 1000)]);
}

export async function markCartConsumed(orderId) {
    await db.query("UPDATE orders SET cart_consumed = TRUE, updated_at = NOW() WHERE id = $1", [orderId]);
}

export async function findOrderById(id) {
    const result = await db.query("SELECT * FROM orders WHERE id = $1 LIMIT 1", [id]);
    return hydrateOrder(db, result.rows[0]);
}

export async function findOrders({ userId, page, limit, includeAll }) {
    const values = [];
    const where = includeAll ? "" : "WHERE user_id = $1";
    if (!includeAll) values.push(userId);
    const count = await db.query(`SELECT COUNT(*)::int AS total FROM orders ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const result = await db.query(`
        SELECT * FROM orders ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    const orders = await Promise.all(result.rows.map((order) => hydrateOrder(db, order)));
    return { orders, total: count.rows[0].total };
}

export async function beginCancellation(orderId) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
        const order = result.rows[0];
        if (!order) {
            await client.query("COMMIT");
            return null;
        }
        if (order.status === "PENDING_PAYMENT") {
            const updated = await client.query(`
                UPDATE orders SET status = 'CANCEL_PENDING', updated_at = NOW() WHERE id = $1 RETURNING *
            `, [orderId]);
            await client.query("COMMIT");
            return hydrateOrder(db, updated.rows[0]);
        }
        const existing = await hydrateOrder(client, order);
        await client.query("COMMIT");
        return existing;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function finishCancellation(orderId) {
    const result = await db.query(`
        UPDATE orders SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = $1 AND status = 'CANCEL_PENDING' RETURNING *
    `, [orderId]);
    return hydrateOrder(db, result.rows[0]);
}
