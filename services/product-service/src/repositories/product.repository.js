import { db } from "../config/database.js";

const PRODUCT_COLUMNS = `
    p.id, p.category_id, p.name, p.price, p.stock, p.created_by, p.updated_by,
    p.created_at, p.updated_at,
    json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category
`;

export async function findProducts({ page, limit, categoryId, search, minPrice, maxPrice }) {
    const conditions = [];
    const values = [];
    const addCondition = (sql, value) => {
        values.push(value);
        conditions.push(sql.replace("?", `$${values.length}`));
    };

    if (categoryId !== undefined) addCondition("p.category_id = ?", categoryId);
    if (search) addCondition("p.name ILIKE '%' || ? || '%'", search);
    if (minPrice !== undefined) addCondition("p.price >= ?", minPrice);
    if (maxPrice !== undefined) addCondition("p.price <= ?", maxPrice);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM products p ${where}`, values);

    values.push(limit, (page - 1) * limit);
    const result = await db.query(`
        SELECT ${PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.id = p.category_id
        ${where}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);

    return { rows: result.rows, total: countResult.rows[0].total };
}

export async function findProductById(id, queryable = db, forUpdate = false) {
    const result = await queryable.query(`
        SELECT ${PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1 LIMIT 1
        ${forUpdate ? "FOR UPDATE OF p" : ""}
    `, [id]);
    return result.rows[0] || null;
}

export async function insertProduct({ categoryId, name, price, stock }, actor) {
    const client = await db.connect();

    try {
        await client.query("BEGIN");
        const result = await client.query(`
            INSERT INTO products (category_id, name, price, stock, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING id
        `, [categoryId, name, price, stock, actor.userId]);
        const product = await findProductById(result.rows[0].id, client);

        await client.query(`
            INSERT INTO audit_logs (
                actor_id, actor_email, action, resource_type, resource_id, after_data
            ) VALUES ($1, $2, 'CREATE', 'product', $3, $4::jsonb)
        `, [actor.userId, actor.email, product.id, JSON.stringify(product)]);

        await client.query("COMMIT");
        return product;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function updateProductById(id, data, actor) {
    const client = await db.connect();
    const columns = { categoryId: "category_id", name: "name", price: "price", stock: "stock" };
    const entries = Object.entries(data);
    const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);

    try {
        await client.query("BEGIN");
        const before = await findProductById(id, client, true);
        if (!before) {
            await client.query("ROLLBACK");
            return null;
        }

        await client.query(`
            UPDATE products
            SET ${assignments.join(", ")}, updated_by = $${entries.length + 2}, updated_at = NOW()
            WHERE id = $1
        `, [id, ...entries.map(([, value]) => value), actor.userId]);
        const after = await findProductById(id, client);

        await client.query(`
            INSERT INTO audit_logs (
                actor_id, actor_email, action, resource_type, resource_id, before_data, after_data
            ) VALUES ($1, $2, 'UPDATE', 'product', $3, $4::jsonb, $5::jsonb)
        `, [actor.userId, actor.email, id, JSON.stringify(before), JSON.stringify(after)]);

        await client.query("COMMIT");
        return after;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function deleteProductById(id, actor) {
    const client = await db.connect();

    try {
        await client.query("BEGIN");
        const before = await findProductById(id, client, true);
        if (!before) {
            await client.query("ROLLBACK");
            return false;
        }

        await client.query("DELETE FROM products WHERE id = $1", [id]);
        await client.query(`
            INSERT INTO audit_logs (
                actor_id, actor_email, action, resource_type, resource_id, before_data
            ) VALUES ($1, $2, 'DELETE', 'product', $3, $4::jsonb)
        `, [actor.userId, actor.email, id, JSON.stringify(before)]);

        await client.query("COMMIT");
        return true;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
