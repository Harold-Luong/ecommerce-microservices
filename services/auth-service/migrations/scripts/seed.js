import bcrypt from "bcrypt";
import { db } from "../../src/config/database.js";

const SALT_ROUNDS = 12;

const users = [
    {
        email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
        password: process.env.SEED_ADMIN_PASSWORD || "admin123",
        role: "admin",
    },
    {
        email: process.env.SEED_USER_EMAIL || "user@example.com",
        password: process.env.SEED_USER_PASSWORD || "password123",
        role: "user",
    },
];

async function seed() {
    let client;

    try {
        client = await db.connect();
        await client.query("BEGIN");

        for (const user of users) {
            const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

            await client.query(`
                INSERT INTO users (email, password_hash, role)
                VALUES ($1, $2, $3)
                ON CONFLICT (email) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    role = EXCLUDED.role,
                    is_active = TRUE,
                    updated_at = NOW()
            `, [user.email.trim().toLowerCase(), passwordHash, user.role]);
        }

        await client.query("COMMIT");
        console.log(`Seed completed: ${users.length} users.`);
        console.log(`Admin: ${users[0].email}`);
        console.log(`User: ${users[1].email}`);
    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error("Seed failed:", error);
        process.exitCode = 1;
    } finally {
        client?.release();
        await db.end();
    }
}

seed();
