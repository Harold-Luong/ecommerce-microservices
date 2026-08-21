import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../../src/config/database.js";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");

async function migrate() {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGSERIAL PRIMARY KEY,
            migration_name VARCHAR(255) UNIQUE NOT NULL,
            executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        const result = await db.query("SELECT migration_name FROM schema_migrations");
        const completed = new Set(result.rows.map((row) => row.migration_name));
        const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
        for (const file of files) {
            if (completed.has(file)) { console.log(`Skip: ${file}`); continue; }
            const client = await db.connect();
            try {
                console.log(`Running: ${file}`);
                await client.query("BEGIN");
                await client.query(await fs.readFile(path.join(directory, file), "utf8"));
                await client.query("INSERT INTO schema_migrations (migration_name) VALUES ($1)", [file]);
                await client.query("COMMIT");
                console.log(`Done: ${file}`);
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally { client.release(); }
        }
        console.log("Migration completed.");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    } finally { await db.end(); }
}

migrate();
