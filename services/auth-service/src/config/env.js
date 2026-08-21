if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET is required");
}

if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET is required");
}


export const env = {
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || "development",

    database: {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    },

    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",

        refreshSecret: process.env.JWT_REFRESH_SECRET,
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    },
};
