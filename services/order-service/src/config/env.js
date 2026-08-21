for (const name of ["JWT_ACCESS_SECRET", "INTERNAL_API_KEY", "CART_SERVICE_URL", "PRODUCT_SERVICE_URL"]) {
    if (!process.env[name]) throw new Error(`${name} is required`);
}

export const env = Object.freeze({
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT) || 3004,
    database: {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || "order_db",
        user: process.env.DB_USER || "orders",
        password: process.env.DB_PASSWORD || "orders",
    },
    jwt: { accessSecret: process.env.JWT_ACCESS_SECRET },
    internalApiKey: process.env.INTERNAL_API_KEY,
    cartServiceUrl: process.env.CART_SERVICE_URL.replace(/\/$/, ""),
    productServiceUrl: process.env.PRODUCT_SERVICE_URL.replace(/\/$/, ""),
    requestTimeoutMs: Number(process.env.SERVICE_REQUEST_TIMEOUT_MS) || 5000,
    reservationTtlSeconds: Number(process.env.INVENTORY_RESERVATION_TTL_SECONDS) || 900,
});
