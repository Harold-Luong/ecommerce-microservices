import { env } from "../config/env.js";
import { request } from "./http.js";

export function getCart(accessToken) {
    return request(`${env.cartServiceUrl}/api/cart`, {
        headers: { authorization: `Bearer ${accessToken}` },
    }, "Cart service");
}

export function consumeCart(orderId, userId, items) {
    return request(`${env.cartServiceUrl}/internal/cart/consume`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-api-key": env.internalApiKey },
        body: JSON.stringify({ orderId, userId, items }),
    }, "Cart service");
}
