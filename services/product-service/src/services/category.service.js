import { findAllCategories, findCategoryBySlug, insertCategory } from "../repositories/category.repository.js";

export function listCategories() {
    return findAllCategories();
}

export async function createCategory(data, actor) {
    if (await findCategoryBySlug(data.slug)) {
        const error = new Error("Category slug already exists");
        error.statusCode = 409;
        throw error;
    }
    return insertCategory(data, actor);
}
