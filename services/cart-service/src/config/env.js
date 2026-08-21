if (!process.env.JWT_ACCESS_SECRET) throw new Error("JWT_ACCESS_SECRET is required");
if (!process.env.PRODUCT_SERVICE_URL) throw new Error("PRODUCT_SERVICE_URL is required");

export const env = Object.freeze({
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT) || 3003,
    database: {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || "cart_db",
        user: process.env.DB_USER || "cart",
        password: process.env.DB_PASSWORD || "cart",
    },
    jwt: { accessSecret: process.env.JWT_ACCESS_SECRET },
    productService: {
        url: process.env.PRODUCT_SERVICE_URL.replace(/\/$/, ""),
        timeoutMs: Number(process.env.PRODUCT_SERVICE_TIMEOUT_MS) || 3000,
    },
});
