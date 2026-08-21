if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET is required");
}
if (!process.env.INTERNAL_API_KEY) throw new Error("INTERNAL_API_KEY is required");

export const env = Object.freeze({
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT) || 3002,

    database: {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || "product_db",
        user: process.env.DB_USER || "product",
        password: process.env.DB_PASSWORD || "product",
    },

    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
    },
    internalApiKey: process.env.INTERNAL_API_KEY,
});
