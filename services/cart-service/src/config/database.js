import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;
export const db = new Pool({
    host: env.database.host,
    port: env.database.port,
    database: env.database.name,
    user: env.database.user,
    password: env.database.password,
});
db.on("error", (error) => console.error("Unexpected PostgreSQL error:", error));
