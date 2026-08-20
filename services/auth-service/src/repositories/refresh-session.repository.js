import { db } from "../config/database.js";

export async function createRefreshSession({
    id,
    userId,
    tokenHash,
    expiresAt,
}) {
    const result = await db.query(
        `
      INSERT INTO refresh_sessions (
        id,
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        user_id,
        expires_at,
        created_at
    `,
        [
            id,
            userId,
            tokenHash,
            expiresAt,
        ],
    );

    return result.rows[0];
}

export async function findRefreshSessionById(id) {
    const result = await db.query(
        `
      SELECT
        id,
        user_id,
        token_hash,
        expires_at,
        revoked_at,
        created_at
      FROM refresh_sessions
      WHERE id = $1
      LIMIT 1
    `,
        [id],
    );

    return result.rows[0] || null;
}

export async function revokeRefreshSession(id) {
    await db.query(
        `
      UPDATE refresh_sessions
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
        [id],
    );
}

export async function revokeAllRefreshSessionsByUserId(userId) {
    await db.query(
        `
      UPDATE refresh_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
        [userId],
    );
}