import { env } from "../config/env.js";

export async function getProduct(productId, { allowMissing = false } = {}) {
    try {
        const response = await fetch(`${env.productService.url}/api/products/${productId}`, {
            signal: AbortSignal.timeout(env.productService.timeoutMs),
        });

        if (response.status === 404 && allowMissing) return null;
        if (response.status === 404) {
            const error = new Error("Product not found");
            error.statusCode = 404;
            throw error;
        }
        if (!response.ok) {
            const error = new Error("Product service is unavailable");
            error.statusCode = 502;
            throw error;
        }
        const body = await response.json();
        return body.data;
    } catch (error) {
        if (error.statusCode) throw error;
        const unavailable = new Error(
            error.name === "TimeoutError" ? "Product service request timed out" : "Product service is unavailable",
        );
        unavailable.statusCode = error.name === "TimeoutError" ? 504 : 502;
        throw unavailable;
    }
}
