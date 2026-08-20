import { db } from "../config/database.js";

export async function findUserByEmail(email) {
    const result = await db.query(
        `
      SELECT id, email, password_hash, is_active, created_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
        [email],
    );

    return result.rows[0] || null;
}

export async function findUserById(id) {
    const result = await db.query(
        `
      SELECT
        id,
        email,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
        [id],
    );

    return result.rows[0] || null;
}

export async function createUser({ email, passwordHash }) {
    const result = await db.query(
        `
      INSERT INTO users (
        email,
        password_hash
      )
      VALUES ($1, $2)
      RETURNING
        id,
        email,
        is_active,
        created_at
    `,
        [email, passwordHash],
    );

    return result.rows[0];
}