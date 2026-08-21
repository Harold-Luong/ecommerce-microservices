import { db } from "../config/database.js";

export async function findAllCategories() {
    const result = await db.query(`
        SELECT id, name, slug, created_by, updated_by, created_at, updated_at
        FROM categories
        ORDER BY name ASC, id ASC
    `);
    return result.rows;
}

export async function findCategoryById(id) {
    const result = await db.query(`
        SELECT id, name, slug, created_by, updated_by, created_at, updated_at
        FROM categories WHERE id = $1 LIMIT 1
    `, [id]);
    return result.rows[0] || null;
}

export async function findCategoryBySlug(slug) {
    const result = await db.query("SELECT id FROM categories WHERE slug = $1 LIMIT 1", [slug]);
    return result.rows[0] || null;
}

export async function insertCategory({ name, slug }, actor) {
    const client = await db.connect();

    try {
        await client.query("BEGIN");
        const result = await client.query(`
            INSERT INTO categories (name, slug, created_by, updated_by)
            VALUES ($1, $2, $3, $3)
            RETURNING id, name, slug, created_by, updated_by, created_at, updated_at
        `, [name, slug, actor.userId]);
        const category = result.rows[0];

        await client.query(`
            INSERT INTO audit_logs (
                actor_id, actor_email, action, resource_type, resource_id, after_data
            ) VALUES ($1, $2, 'CREATE', 'category', $3, $4::jsonb)
        `, [actor.userId, actor.email, category.id, JSON.stringify(category)]);

        await client.query("COMMIT");
        return category;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
