import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../../src/config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDirectory = path.resolve(
    __dirname,
    "../../migrations",
);

async function ensureMigrationTable() {
    await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrations() {
    const result = await db.query(`
    SELECT migration_name
    FROM schema_migrations
    ORDER BY id;
  `);

    return new Set(
        result.rows.map((row) => row.migration_name),
    );
}

async function migrate() {
    try {
        console.log("Starting database migration...");

        await ensureMigrationTable();

        const executedMigrations = await getExecutedMigrations();

        const files = await fs.readdir(migrationsDirectory);

        const migrationFiles = files
            .filter((file) => file.endsWith(".sql"))
            .sort();

        for (const file of migrationFiles) {
            if (executedMigrations.has(file)) {
                console.log(`Skip: ${file}`);
                continue;
            }

            const filePath = path.join(
                migrationsDirectory,
                file,
            );

            const sql = await fs.readFile(filePath, "utf8");

            console.log(`Running: ${file}`);

            const client = await db.connect();

            try {
                await client.query("BEGIN");

                await client.query(sql);

                await client.query(
                    `
            INSERT INTO schema_migrations (migration_name)
            VALUES ($1);
          `,
                    [file],
                );

                await client.query("COMMIT");

                console.log(`Done: ${file}`);
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        }

        console.log("Migration completed.");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

migrate();