import { consumeCart, getCart } from "../clients/cart.client.js";
import { releaseInventory, reserveInventory } from "../clients/product.client.js";
import {
    beginCancellation, createPendingOrder, finalizeOrder, findOrderById,
    findOrderByIdempotency, findOrders, finishCancellation, markCartConsumed, markOrderFailed,
} from "../repositories/order.repository.js";

function serviceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function consumeOrderCart(order) {
    if (order.cart_consumed) return order;
    try {
        await consumeCart(order.id, order.user_id, order.request_items);
        await markCartConsumed(order.id);
        return { ...order, cart_consumed: true };
    } catch (error) {
        console.warn(`Order ${order.id} created but cart consumption failed:`, error.message);
        return order;
    }
}

export async function checkout({ userId, accessToken, idempotencyKey }) {
    let order = await findOrderByIdempotency(userId, idempotencyKey);
    let created = false;

    if (!order) {
        const cart = await getCart(accessToken);
        if (!cart.items?.length) throw serviceError("Cart is empty", 409);
        const requestItems = cart.items.map((item) => ({
            productId: Number(item.product_id), quantity: item.quantity,
        }));
        const result = await createPendingOrder(userId, idempotencyKey, requestItems);
        order = result.order;
        created = result.created;
    }

    if (order.status === "FAILED") throw serviceError(order.failure_reason || "Order checkout previously failed", 409);
    if (["PENDING_PAYMENT", "CANCELLED", "CANCEL_PENDING"].includes(order.status)) {
        if (order.status === "PENDING_PAYMENT") order = await consumeOrderCart(order);
        return { order, created: false };
    }

    let reservation;
    try {
        reservation = await reserveInventory(order.id, userId, order.request_items);
    } catch (error) {
        if ([404, 409].includes(error.statusCode)) await markOrderFailed(order.id, error.message);
        throw error;
    }

    if (reservation.status !== "RESERVED") {
        await markOrderFailed(order.id, `Inventory reservation is ${reservation.status}`);
        throw serviceError("Inventory is no longer reserved for this order", 409);
    }

    order = await finalizeOrder(order.id, reservation);
    order = await consumeOrderCart(order);
    return { order, created };
}

export async function getOrder(id, auth) {
    const order = await findOrderById(id);
    if (!order) throw serviceError("Order not found", 404);
    if (auth.role !== "admin" && String(order.user_id) !== String(auth.userId)) {
        throw serviceError("Order not found", 404);
    }
    return order;
}

export async function listOrders(filters, auth) {
    const result = await findOrders({
        ...filters, userId: auth.userId, includeAll: auth.role === "admin",
    });
    return {
        items: result.orders,
        pagination: {
            page: filters.page, limit: filters.limit, total: result.total,
            totalPages: Math.ceil(result.total / filters.limit),
        },
    };
}

export async function cancelOrder(id, auth) {
    const current = await getOrder(id, auth);
    if (current.status === "CANCELLED") return current;
    if (current.status === "PENDING") throw serviceError("Order is still being processed; retry cancellation shortly", 409);
    if (current.status === "FAILED") throw serviceError("Failed order cannot be cancelled", 409);

    const order = await beginCancellation(id);
    if (order.status !== "CANCEL_PENDING") throw serviceError(`Order cannot be cancelled from status ${order.status}`, 409);
    await releaseInventory(order.id);
    return await finishCancellation(order.id) || findOrderById(order.id);
}
