import { env } from "../config/env.js";
import { request } from "./http.js";

const headers = { "content-type": "application/json", "x-internal-api-key": env.internalApiKey };

export function reserveInventory(orderId, userId, items) {
    return request(`${env.productServiceUrl}/internal/inventory/reservations`, {
        method: "POST", headers,
        body: JSON.stringify({ orderId, userId, items, expiresInSeconds: env.reservationTtlSeconds }),
    }, "Product service");
}

export function releaseInventory(orderId) {
    return request(`${env.productServiceUrl}/internal/inventory/reservations/${orderId}/release`, {
        method: "POST", headers,
    }, "Product service");
}
