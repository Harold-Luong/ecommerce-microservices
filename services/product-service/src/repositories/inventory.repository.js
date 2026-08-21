import crypto from "node:crypto";
import { db } from "../config/database.js";

async function loadReservation(queryable, orderId) {
    const reservationResult = await queryable.query(`
        SELECT id, order_id, user_id, status, expires_at, created_at, updated_at
        FROM inventory_reservations WHERE order_id = $1 LIMIT 1
    `, [orderId]);
    const reservation = reservationResult.rows[0];
    if (!reservation) return null;
    const items = await queryable.query(`
        SELECT product_id, product_name, unit_price, quantity
        FROM inventory_reservation_items
        WHERE reservation_id = $1 ORDER BY product_id
    `, [reservation.id]);
    return { ...reservation, items: items.rows };
}

export async function reserveInventory({ orderId, userId, items, expiresInSeconds }) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [orderId]);
        const existing = await loadReservation(client, orderId);
        if (existing) {
            const expected = [...items].sort((a, b) => a.productId - b.productId);
            const sameRequest = String(existing.user_id) === String(userId)
                && existing.items.length === expected.length
                && existing.items.every((item, index) =>
                    Number(item.product_id) === expected[index].productId
                    && item.quantity === expected[index].quantity);
            if (!sameRequest) {
                const error = new Error("Order ID was already used with a different inventory request");
                error.statusCode = 409;
                throw error;
            }
            await client.query("COMMIT");
            return existing;
        }

        const products = [];
        for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
            const result = await client.query(`
                SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE
            `, [item.productId]);
            const product = result.rows[0];
            if (!product) {
                const error = new Error(`Product ${item.productId} not found`);
                error.statusCode = 404;
                throw error;
            }
            if (product.stock < item.quantity) {
                const error = new Error(`Insufficient stock for product ${item.productId}`);
                error.statusCode = 409;
                throw error;
            }
            products.push({ ...product, quantity: item.quantity });
        }

        const reservationId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
        await client.query(`
            INSERT INTO inventory_reservations (id, order_id, user_id, expires_at)
            VALUES ($1, $2, $3, $4)
        `, [reservationId, orderId, userId, expiresAt]);

        for (const product of products) {
            const stockResult = await client.query(`
                UPDATE products
                SET stock = stock - $1, updated_at = NOW()
                WHERE id = $2 AND stock >= $1
                RETURNING id
            `, [product.quantity, product.id]);
            if (!stockResult.rows[0]) {
                const error = new Error(`Insufficient stock for product ${product.id}`);
                error.statusCode = 409;
                throw error;
            }
            await client.query(`
                INSERT INTO inventory_reservation_items (
                    reservation_id, product_id, product_name, unit_price, quantity
                ) VALUES ($1, $2, $3, $4, $5)
            `, [reservationId, product.id, product.name, product.price, product.quantity]);
        }

        const reservation = await loadReservation(client, orderId);
        await client.query("COMMIT");
        return reservation;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function releaseInventory(orderId) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`
            SELECT id, status FROM inventory_reservations WHERE order_id = $1 FOR UPDATE
        `, [orderId]);
        const reservation = result.rows[0];
        if (!reservation) {
            await client.query("COMMIT");
            return null;
        }
        if (reservation.status === "RELEASED") {
            const existing = await loadReservation(client, orderId);
            await client.query("COMMIT");
            return existing;
        }

        const items = await client.query(`
            SELECT product_id, quantity FROM inventory_reservation_items
            WHERE reservation_id = $1 ORDER BY product_id
        `, [reservation.id]);
        for (const item of items.rows) {
            const restored = await client.query(`
                UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2
                RETURNING id
            `, [item.quantity, item.product_id]);
            if (!restored.rows[0]) {
                const error = new Error(`Cannot release stock because product ${item.product_id} no longer exists`);
                error.statusCode = 409;
                throw error;
            }
        }
        await client.query(`
            UPDATE inventory_reservations SET status = 'RELEASED', updated_at = NOW() WHERE id = $1
        `, [reservation.id]);
        const released = await loadReservation(client, orderId);
        await client.query("COMMIT");
        return released;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
